/* S08 TEST — vérification locale, sans accès Supabase et sans restauration.
 * Usage: après sélection du dossier "garage-s08-physical-...", appeler
 * await S08BackupVerifier.verify(folderHandle) depuis une page HTTPS.
 */
(function(root){
"use strict";
async function hash(bytes){
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
}
function safePath(path){
 return typeof path==="string" && path.length>0 && path.length<2048 &&
 !path.startsWith("/") && !path.includes("\\") && !path.includes("\0") &&
 path.split("/").every(s=>s.length>0&&s!=="."&&s!==".."&&s.length<256);
}
async function readFile(folder,path){
 if(!safePath(path))throw Error("Chemin non sécuritaire");
 let dir=folder;
 const parts=path.split("/");
 for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part);
 return (await dir.getFileHandle(parts.at(-1))).getFile();
}
async function verify(folder,progress=()=>{}){
 if(!folder?.getFileHandle||!folder?.getDirectoryHandle)throw Error("Dossier local requis");
 const manifest=JSON.parse(await (await readFile(folder,"manifest.json")).text());
 const snapshotFile=await readFile(folder,"garage-data.json");
 const snapshotBytes=await snapshotFile.arrayBuffer();
 const snapshot=JSON.parse(new TextDecoder().decode(snapshotBytes));
 const failures=[];
 if(!manifest.snapshotSha256||manifest.snapshotBytes!==snapshotBytes.byteLength||
    await hash(snapshotBytes)!==manifest.snapshotSha256)
  failures.push("Empreinte du snapshot JSON invalide");
 if(manifest.status!=="COMPLETE")failures.push("Manifeste non COMPLETE");
 if(!Array.isArray(manifest.files)||!Array.isArray(manifest.failed)||
    !Array.isArray(manifest.unresolvedReferences))throw Error("Manifeste invalide");
 if(manifest.failed.length||manifest.unresolvedReferences.length)
  failures.push("Erreurs ou références non résolues dans le manifeste");
 if(!Array.isArray(snapshot.garages)||!Array.isArray(snapshot.quotes)||
    snapshot.garages.length!==manifest.garageCount||
    snapshot.quotes.length!==manifest.quoteCount)
  failures.push("Nombre de garages ou de soumissions incohérent");
 if(snapshot.accountId!==manifest.accountId||
    snapshot.garages.some(g=>g.garage_id!==manifest.garageId||
      g.user_id!==manifest.accountId)||
    snapshot.quotes.some(q=>q.garage_id!==manifest.garageId))
  failures.push("Identité du garage ou soumissions incohérente");
 if(snapshot.createdAt!==manifest.createdAt ||
    !Array.isArray(snapshot.garages) || !Array.isArray(snapshot.quotes) ||
    snapshot.garages.length!==1 ||
    snapshot.garages.some(g=>!g || typeof g!=="object" || !g.data || typeof g.data!=="object") ||
    snapshot.quotes.some(q=>!q || typeof q!=="object" || !q.id))
  failures.push("Structure ou horodatage du snapshot incohérent");
 if(new Set(snapshot.quotes.map(q=>q.id)).size!==snapshot.quotes.length)
  failures.push("Soumissions dupliquées");
 if(new Set(snapshot.garages.map(g=>g.garage_id)).size!==snapshot.garages.length)
  failures.push("Garages dupliqués");
 const refs=new Set();
 for(const garage of snapshot.garages){
  for(const wo of (Array.isArray(garage.data?.workorders)?garage.data.workorders:[])){
   for(const a of (Array.isArray(wo.attachments)?wo.attachments:[])){
    if(typeof a.path==="string")refs.add(a.path);
   }
  }
 }
 const paths=new Set();
 let totalBytes=0;
 for(let i=0;i<manifest.files.length;i++){
  const entry=manifest.files[i];
  progress("Vérification "+(i+1)+"/"+manifest.files.length);
  if(!safePath(entry.path)||paths.has(entry.path)){failures.push("Chemin invalide ou dupliqué");continue}
  paths.add(entry.path);
  try{
   const file=await readFile(await folder.getDirectoryHandle("files"),entry.path);
   const bytes=await file.arrayBuffer();
   if(bytes.byteLength!==entry.bytes||await hash(bytes)!==entry.sha256)
    failures.push("Fichier différent : "+entry.path);
   totalBytes+=bytes.byteLength;
  }catch(e){failures.push("Fichier illisible : "+entry.path+" ("+String(e.message||e)+")")}
 }
 if(refs.size!==manifest.referencedPaths||
    [...refs].some(path=>!paths.has(path)))failures.push("Références BT non sauvegardées");
 if(manifest.fileCount!==manifest.files.length||totalBytes!==manifest.totalBytes)
  failures.push("Totaux de fichiers ou octets incohérents");
 // Contrôles croisés du manifeste : ne pas accepter un inventaire incomplet
 // même si les empreintes des seuls fichiers présents sont correctes.
 if(!Number.isSafeInteger(manifest.ownedPaths)||manifest.ownedPaths<0||
    !Number.isSafeInteger(manifest.referencedPaths)||manifest.referencedPaths<0||
    manifest.files.length<manifest.ownedPaths||manifest.files.length<manifest.referencedPaths)
  failures.push("Inventaire Storage ou références incohérents");
 // Contrôler les noms précis des objets Storage et non seulement leur nombre.
 // Sans cette liste, un objet non référencé pourrait manquer sans être détecté.
 if(!Array.isArray(manifest.ownedPathList) ||
    manifest.ownedPathList.length!==manifest.ownedPaths ||
    new Set(manifest.ownedPathList).size!==manifest.ownedPathList.length ||
    manifest.ownedPathList.some(path=>!safePath(path)||!paths.has(path)))
  failures.push("Inventaire nominatif Storage incomplet ou incohérent");
 if(manifest.files.some(entry=>typeof entry.referenced!=="boolean"||
    entry.referenced!==refs.has(entry.path)))
  failures.push("Indicateurs de références BT incohérents");
 if(!Array.isArray(manifest.memberIds)||!manifest.memberIds.includes(manifest.accountId)||
    new Set(manifest.memberIds).size!==manifest.memberIds.length)
  failures.push("Inventaire des membres incohérent");
 if(manifest.format!=="atelier-test-physical-backup-v1"||
    snapshot.format!=="atelier-test-full-garage-snapshot-v1"||
    manifest.source!=="Supabase TEST"||manifest.bucket!=="wo-files")
  failures.push("Format ou source de sauvegarde inattendu");
 return {ok:failures.length===0,garageId:manifest.garageId,
  fileCount:manifest.files.length,totalBytes,quoteCount:snapshot.quotes.length,failures,
  note:"Vérification d'intégrité locale uniquement : restauration non testée."};
}
root.S08BackupVerifier={verify,safePath};
})(typeof window!=="undefined"?window:globalThis);
