/* S10 — legacy PROD physical backup, NOT auto-executed.
 * Use ONLY from a trusted, authenticated browser session on the CURRENT PROD site.
 * The caller supplies the existing PROD supabase-js client and a user-chosen
 * File System Access directory. Never logs customer records or credentials.
 * No database/Storage writes, migration, deletion or remote upload.
 */
(function(root) {
"use strict";
const REF="feeapfylfzlvgnqtglnh",BUCKET="wo-files",PAGE=100;
function assert(value,message){if(!value)throw Error(message)}
function pathValid(s){return typeof s==="string"&&s.length>0&&s.length<2048&&
 !s.startsWith("/")&&!s.includes("\\")&&!s.includes("\0")&&
 s.split("/").every(p=>p&&p!=="."&&p!==".."&&p.length<256)}
async function sha256(bytes){
 const h=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,"0")).join("");
}
async function saveBytes(dir,path,bytes) {
 assert(pathValid(path),"Unsafe Storage path");
 let folder=dir;
 const parts=path.split("/");
 for(const p of parts.slice(0,-1))folder=await folder.getDirectoryHandle(p,{create:true});
 const handle=await folder.getFileHandle(parts.at(-1),{create:true});
 const writer=await handle.createWritable();
 try{await writer.write(bytes);await writer.close()}catch(e){try{await writer.abort()}catch(_){}throw e}
 const disk=await (await handle.getFile()).arrayBuffer();
 const h=await sha256(disk);
 assert(h===await sha256(bytes),"Disk checksum mismatch");
 return {path,bytes:disk.byteLength,sha256:h};
}
async function writeJson(dir,name,obj) {
 const h=await dir.getFileHandle(name,{create:true});
 const w=await h.createWritable();
 try{await w.write(JSON.stringify(obj,null,2)+"\n");await w.close()}
 catch(e){try{await w.abort()}catch(_){}throw e}
}
async function collectPaths(client,prefix="clients") {
 const seen=new Set(),queue=[prefix],visited=new Set();
 while(queue.length){
  const folder=queue.shift();
  assert(pathValid(folder)&&folder.startsWith("clients"),"Unexpected Storage folder");
  if(visited.has(folder))continue;
  visited.add(folder);
  let offset=0;
  for(;;){
   const {data,error}=await client.storage.from(BUCKET).list(folder,
    {limit:PAGE,offset,sortBy:{column:"name",order:"asc"}});
   if(error||!Array.isArray(data))throw Error("Cannot list Storage: "+(error?.message||"invalid"));
   for(const entry of data){
    assert(typeof entry?.name==="string","Invalid Storage entry");
    const path=folder+"/"+entry.name;
    assert(pathValid(path),"Invalid Storage object path");
    if(!entry.id&&!entry.metadata)queue.push(path);
    else assert(!seen.has(path) && !seen.add(path),"Duplicate Storage path");
   }
   if(data.length<PAGE)break;
   offset+=PAGE;
   assert(offset<=50000,"Storage pagination too large");
  }
 }
 return [...seen].sort();
}
function refsFrom(data){
 const refs=new Set();
 for(const wo of Array.isArray(data?.workorders)?data.workorders:[]){
  for(const a of Array.isArray(wo?.attachments)?wo.attachments:[]){
   assert(pathValid(a?.path),"Invalid referenced attachment");
   refs.add(a.path);
  }
 }
 return [...refs].sort();
}
async function backup(client,parent,progress=()=>{}){
 assert(typeof window!=="undefined"&&window.isSecureContext,
  "Secure browser context required");
 assert(client?.auth?.getUser&&client?.from&&client?.storage?.from,"Authenticated client required");
 assert(parent?.getDirectoryHandle&&parent?.getFileHandle,"User-selected local directory required");
 assert(new URL(client.supabaseUrl||"").hostname===REF+".supabase.co",
  "REFUSED: only original production Supabase URL is accepted");
 const {data:auth,error:authError}=await client.auth.getUser();
 const uid=auth?.user?.id;
 assert(!authError&&typeof uid==="string"&&uid,"Active production login required");
 const load=async()=>{
  const {data,error}=await client.from("garage_data").select("user_id,data,updated_at")
   .eq("user_id",uid).single();
  if(error||!data||data.user_id!==uid||!data.data)
   throw Error("Cannot read exactly the current owner's production data");
  return data;
 };
 const before=await load();
 const refs=refsFrom(before.data);
 const owned=await collectPaths(client);
 const missing=refs.filter(p=>!owned.includes(p));
 assert(missing.length===0,"An attachment is absent from Storage: refusing COMPLETE");
 assert(owned.length===55&&refs.length===49,
  "Historical checkpoint differs (expected 55 objects and 49 distinct linked paths). Revalidate before export");
 const folder=await parent.getDirectoryHandle("garage-s10-PROD-backup-"+new Date().toISOString().replace(/[:.]/g,"-"),{create:true});
 const files=await folder.getDirectoryHandle("files",{create:true});
 const manifest={format:"atelier-prod-legacy-physical-v1",source:"PROD",
  project:REF,bucket:BUCKET,createdAt:new Date().toISOString(),status:"INCOMPLETE",
  expectedFiles:owned.length,linkedPaths:refs.length,
  unlinkedPaths:owned.length-refs.length,files:[],failed:[]};
 await writeJson(folder,"manifest.json",manifest);
 await writeJson(folder,"garage-data.json",before);
 const snapshotBytes=await (await folder.getFileHandle("garage-data.json")).getFile();
 manifest.jsonBytes=snapshotBytes.size;
 manifest.jsonSha256=await sha256(await snapshotBytes.arrayBuffer());
 for(let i=0;i<owned.length;i++){
  const path=owned[i];
  progress("Fichier "+(i+1)+"/"+owned.length);
  try{
   const {data,error}=await client.storage.from(BUCKET).download(path);
   if(error||!data)throw Error(error?.message||"File download failed");
   const file=await saveBytes(files,path,await data.arrayBuffer());
   manifest.files.push({...file,referenced:refs.includes(path)});
  }catch(e){manifest.failed.push({path,error:String(e?.message||e).slice(0,250)});}
 }
 try{
  const {data:session,error:sessionError}=await client.auth.getUser();
  assert(!sessionError&&session?.user?.id===uid,"Session changed during export");
  const after=await load();
  assert(JSON.stringify(after)===JSON.stringify(before),"Garage cloud data changed during export");
  const afterPaths=await collectPaths(client);
  assert(JSON.stringify(afterPaths)===JSON.stringify(owned),"Storage inventory changed during export");
  assert(manifest.files.length===owned.length&&manifest.failed.length===0,
   "Some physical files could not be saved");
  assert(manifest.files.every(f=>f.sha256&&f.bytes>=0),"File checksum missing");
  manifest.status="COMPLETE";
 }catch(e){manifest.failed.push({path:"consistency",error:String(e?.message||e).slice(0,250)})}
 manifest.completedAt=new Date().toISOString();
 manifest.totalBytes=manifest.files.reduce((n,f)=>n+f.bytes,0);
 await writeJson(folder,"manifest.json",manifest);
 progress(manifest.status==="COMPLETE"?"Sauvegarde physique terminée":"SAUVEGARDE INCOMPLÈTE — voir manifest.json");
 return {status:manifest.status,fileCount:manifest.files.length,totalBytes:manifest.totalBytes,
  failures:manifest.failed.length,folderName:folder.name};
}
root.S10LegacyProdBackup={backup,collectPaths,refsFrom,pathValid};
})(typeof window!=="undefined"?window:globalThis);
