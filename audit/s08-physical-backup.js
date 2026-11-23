/* S08 TEST: offline physical backup helper; does not mutate Supabase.
 * Caller must be authenticated and explicitly choose a local directory.
 */
(function(root){
"use strict";
const BUCKET="wo-files";
const PAGE=100;
function validPath(path){
 return typeof path==="string" && path.length>0 && path.length<2048 &&
 !path.startsWith("/") && !path.includes("\\") && !path.includes("\0") &&
 path.split("/").every(s=>s!==""&&s!=="."&&s!==".."&&s.length<256);
}
function pathsFromGarages(garages){
 const refs=new Set();
 for(const garage of garages){
  const wos=Array.isArray(garage?.data?.workorders)?garage.data.workorders:[];
  for(const wo of wos){
   const attachments=Array.isArray(wo?.attachments)?wo.attachments:[];
   for(const a of attachments)if(typeof a?.path==="string")refs.add(a.path);
  }
 }
 return [...refs].sort();
}
async function sha256(bytes){
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
async function pageRows(queryFactory){
 let all=[],start=0;
 while(true){
  const {data,error}=await queryFactory(start,start+PAGE-1);
  if(error)throw error;
  if(!Array.isArray(data))throw Error("Réponse paginée invalide");
  all.push(...data);
  if(data.length<PAGE)break;
  start+=PAGE;
  if(start>50000)throw Error("Pagination excessive : vérification manuelle requise");
 }
 return all;
}
async function listOwned(client,uid){
 if(!validPath(uid))throw Error("Identifiant du compte invalide");
 const all=new Set();
 const queue=[uid];
 const visited=new Set();
 while(queue.length){
  const prefix=queue.shift();
  if(visited.has(prefix))continue;
  visited.add(prefix);
  let offset=0;
  while(true){
   const {data,error}=await client.storage.from(BUCKET).list(prefix,{
    limit:PAGE,offset,sortBy:{column:"name",order:"asc"}
   });
   if(error)throw Error("Énumération Storage refusée : "+error.message);
   if(!Array.isArray(data))throw Error("Liste Storage invalide");
   for(const entry of data){
    const name=entry?.name;
    if(typeof name!=="string"||!name||name==="."||name==="..")continue;
    const full=prefix+"/"+name;
    if(!validPath(full))throw Error("Chemin Storage non sécuritaire");
    if(!entry.id && !entry.metadata)queue.push(full);
    else all.add(full);
   }
   if(data.length<PAGE)break;
   offset+=PAGE;
   if(offset>50000)throw Error("Trop d'objets dans un dossier Storage");
  }
 }
 return [...all].sort();
}
async function directoryFor(rootDir,path){
 const segments=path.split("/");
 if(!validPath(path))throw Error("Chemin local non sécuritaire");
 let handle=rootDir;
 for(const segment of segments.slice(0,-1)){
  handle=await handle.getDirectoryHandle(segment,{create:true});
 }
 return {directory:handle,name:segments.at(-1)};
}
async function saveVerified(folder,path,bytes){
 if(!validPath(path))throw Error("Chemin de sauvegarde non sécuritaire");
 const {directory,name}=await directoryFor(folder,path);
 const handle=await directory.getFileHandle(name,{create:true});
 const writer=await handle.createWritable();
 try{await writer.write(bytes);await writer.close()}
 catch(e){try{await writer.abort()}catch(_){}throw e}
 const actual=await (await handle.getFile()).arrayBuffer();
 const expectedHash=await sha256(bytes);
 const diskHash=await sha256(actual);
 if(expectedHash!==diskHash)throw Error("Empreinte du fichier local différente");
 return {bytes:actual.byteLength,sha256:diskHash};
}
async function writeJson(folder,name,data){
 if(!validPath(name)||name.includes("/"))throw Error("Nom JSON non valide");
 const file=await folder.getFileHandle(name,{create:true});
 const writer=await file.createWritable();
 await writer.write(JSON.stringify(data,null,2)+"\n");
 await writer.close();
}
async function backup(client,rootFolder,progress=()=>{}){
 if(!client?.auth||!client?.storage||!rootFolder?.getDirectoryHandle)
  throw Error("Session ou dossier local absent");
 const auth=await client.auth.getUser();
 const user=auth?.data?.user;
 if(auth.error||!user?.id)throw Error("Connexion Supabase requise");
 const uid=user.id;
 if(!validPath(uid))throw Error("Compte invalide");
 const memberships=await pageRows((from,to)=>client.from("garage_members")
  .select("garage_id,user_id,role").eq("user_id",uid).range(from,to));
 if(memberships.length!==1 || memberships[0].role!=="owner")
  throw Error("Sauvegarde complète réservée au propriétaire d’un seul garage");
 const garageId=memberships[0].garage_id;
 const memberResponse=await client.rpc("backup_garage_member_ids",{p_garage_id:garageId});
 if(memberResponse.error || !Array.isArray(memberResponse.data))
  throw Error("Inventaire des membres refusé : "+(memberResponse.error?.message||"invalide"));
 const members=memberResponse.data;
 if(!members.some(m=>m.user_id===uid) || !members.every(m=>validPath(m.user_id)) ||
    new Set(members.map(m=>m.user_id)).size!==members.length)
  throw Error("Membres incohérents ou dupliqués");
 const garages=await pageRows((from,to)=>client.from("garage_data")
  .select("garage_id,user_id,data,version,updated_at")
  .eq("garage_id",garageId).range(from,to));
 if(garages.length!==1 || garages[0].user_id!==uid)
  throw Error("Snapshot garage absent ou propriétaire incohérent");
 const quotes=await pageRows((from,to)=>client.rpc("backup_garage_quotes",
  {p_garage_id:garageId}).range(from,to));
 if(quotes.some(q=>q.garage_id!==garageId))throw Error("Soumission hors garage");
 const refs=pathsFromGarages(garages);
 const storageRows=await pageRows((from,to)=>client.rpc("backup_garage_storage_paths",
  {p_garage_id:garageId}).range(from,to));
 const owned=[...new Set(storageRows.map(row=>row.object_name))].sort();
 if(owned.length!==storageRows.length || owned.some(path=>!validPath(path)))
  throw Error("Inventaire Storage invalide ou dupliqué");
 const targetPaths=[...new Set([...owned,...refs])].sort();
 const stamp=new Date().toISOString().replace(/[:.]/g,"-");
 const folder=await rootFolder.getDirectoryHandle("garage-s08-physical-"+stamp,{create:true});
 const filesFolder=await folder.getDirectoryHandle("files",{create:true});
 const manifest={
  format:"atelier-test-physical-backup-v1",
  accountId:uid,garageId,memberIds:members.map(m=>m.user_id),createdAt:new Date().toISOString(),
  source:"Supabase TEST",
  bucket:BUCKET,bytesIncluded:true,status:"INCOMPLETE",
  garageCount:garages.length,quoteCount:quotes.length,
  referencedPaths:refs.length,ownedPaths:owned.length,
  files:[],failed:[],unresolvedReferences:[],
  note:"Fichiers physiques et données JSON; restauration automatique NON disponible."
 };
 // Écrire d'abord un manifeste INCOMPLETE : une interruption du navigateur
 // ou un échec de téléchargement ne doit jamais laisser un dossier ambigu.
 // Les valeurs de comptage initiales sont provisoires et seront finalisées à la fin.
 await writeJson(folder,"manifest.json",manifest);
 progress("Inventaire : "+targetPaths.length+" fichier(s) accessibles à vérifier");
 await writeJson(folder,"garage-data.json",{
  format:"atelier-test-full-garage-snapshot-v1",
  accountId:uid,createdAt:manifest.createdAt,garages,quotes
 });
 const snapshotBytes=await (await (await folder.getFileHandle("garage-data.json")).getFile()).arrayBuffer();
 manifest.snapshotSha256=await sha256(snapshotBytes);
 manifest.snapshotBytes=snapshotBytes.byteLength;
 let index=0;
 for(const path of targetPaths){
  index++;
  progress("Fichier "+index+"/"+targetPaths.length);
  if(!validPath(path)){manifest.failed.push({path,error:"Chemin invalide"});continue}
  try{
   // Legacy BT path may be outside the owner prefix but still validly granted.
   const {data,error}=await client.storage.from(BUCKET).download(path);
   if(error||!data)throw Error(error?.message||"Téléchargement vide");
   const bytes=await data.arrayBuffer();
   const verify=await saveVerified(filesFolder,path,bytes);
   manifest.files.push({path,...verify,referenced:refs.includes(path)});
  }catch(error){manifest.failed.push({path,error:String(error.message||error).slice(0,250)})}
 }
 const completed=new Set(manifest.files.map(f=>f.path));
 manifest.unresolvedReferences=refs.filter(p=>!completed.has(p));
 try{
  // Another account may have replaced the session while files were downloading.
  const finalUser=await client.auth.getUser();
  if(finalUser.error || finalUser.data?.user?.id!==uid)
   manifest.failed.push({path:"auth",error:"Compte différent à la fin de l'export"});
  // A file added/removed while exporting must not silently disappear
  // from a backup marked COMPLETE.
  const latestMemberResponse=await client.rpc("backup_garage_member_ids",{p_garage_id:garageId});
  if(latestMemberResponse.error || !Array.isArray(latestMemberResponse.data) ||
     latestMemberResponse.data.length!==members.length ||
     latestMemberResponse.data.some((m,i)=>m.user_id!==members[i].user_id))
   manifest.failed.push({path:"garage_members",error:"La liste des membres a changé pendant l'export"});
  const storageRowsAfter=await pageRows((from,to)=>client.rpc("backup_garage_storage_paths",
   {p_garage_id:garageId}).range(from,to));
  const ownedAfter=storageRowsAfter.map(row=>row.object_name).sort();
  if(ownedAfter.length!==owned.length ||
     ownedAfter.some((path,index)=>path!==owned[index]))
   manifest.failed.push({path:"wo-files",error:"L'inventaire Storage a changé pendant l'export"});
  const latestQuotes=await pageRows((from,to)=>client.rpc("backup_garage_quotes",
   {p_garage_id:garageId}).range(from,to));
  const quoteSnapshots=new Map(quotes.map(q=>[q.id,JSON.stringify(q)]));
  if(latestQuotes.length!==quotes.length ||
    latestQuotes.some(q=>q.garage_id!==garageId||
      quoteSnapshots.get(q.id)!==JSON.stringify(q)))
   manifest.failed.push({path:"garage_quotes",error:"Les soumissions ont changé pendant l'export"});
  // Verify that all referenced BT paths were saved, including old shared files.
 
  const versions=await pageRows((from,to)=>client.from("garage_data")
   .select("garage_id,user_id,data,version,updated_at").eq("garage_id",garageId).range(from,to));
  const original=new Map(garages.map(g=>[g.garage_id,JSON.stringify(g)]));
  if(versions.length!==garages.length ||
     versions.some(v=>v.user_id!==uid||!original.has(v.garage_id)||
      JSON.stringify(v)!==original.get(v.garage_id))){
   manifest.failed.push({path:"garage_data",error:"Les versions cloud ont changé pendant l'export"});
  }
 }catch(error){manifest.failed.push({path:"garage_data",error:"Impossible de revérifier les versions : "+String(error.message||error)})}
 manifest.status=manifest.failed.length===0&&manifest.unresolvedReferences.length===0?"COMPLETE":"INCOMPLETE";
 manifest.completedAt=new Date().toISOString();
 manifest.fileCount=manifest.files.length;
 manifest.totalBytes=manifest.files.reduce((sum,f)=>sum+f.bytes,0);
 await writeJson(folder,"manifest.json",manifest);
 progress(manifest.status==="COMPLETE"?
  "Terminé : "+manifest.fileCount+" fichiers sauvegardés et vérifiés":
  "ATTENTION : sauvegarde incomplète, consulter manifest.json");
 return manifest;
}
root.S08PhysicalBackup={backup,validPath,pathsFromGarages,listOwned,saveVerified};
})(typeof window!=="undefined"?window:globalThis);
