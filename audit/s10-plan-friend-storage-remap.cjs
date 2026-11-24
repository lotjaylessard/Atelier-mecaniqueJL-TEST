#!/usr/bin/env node
"use strict";
/* S10 OFFLINE FILE-MAPPING PLANNER. Does NOT talk to Supabase, upload files,
 * change any database or print private Storage paths. Review-only.
 * Usage: node audit/s10-plan-friend-storage-remap.cjs <input.json> <output.json> <destination-owner-uuid>
 * Input {data:{workorders:[{attachments:[{path:"clients/..."}]}]},objects:[{name:"clients/...",size:123}]}
 * Input and output contain private customer paths. Store only offline, never commit.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const sourceRef="bdrtlveohbjwxcobeysb";
const uidRegex=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(s){throw Error("S10_FRIEND_REMAP_REFUSED: "+s)}
function plan(input,destUid){
 if(!uidRegex.test(destUid||""))fail("destination user UUID required");
 if(!input||typeof input!=="object"||Array.isArray(input))fail("input object required");
 const {data,objects}=input;
 if(!data||!Array.isArray(data.workorders)||!Array.isArray(objects)||!objects.length)
   fail("data.workorders and nonempty objects required");
 const names=new Set(),mapping=new Map(),hashes=new Set();
 let bytes=0;
 for(const obj of objects){
   const name=obj?.name;
   if(typeof name!=="string"||!name.startsWith("clients/")||
      name.length<=8||name.includes("\\")||name.includes("\0")||
      name.split("/").some(x=>x===".."||x==="."||x===""))
     fail("unexpected or unsafe source path");
   if(names.has(name))fail("duplicate source object");
   names.add(name);
   if(!Number.isSafeInteger(obj.size)||obj.size<0)fail("missing object byte size");
   bytes+=obj.size;
   if(!Number.isSafeInteger(bytes))fail("byte count overflow");
   // Hash of full original path avoids path collisions after prefix rewrite.
   // The remapped object remains under a user-id namespace required by RLS.
   const digest=crypto.createHash("sha256").update(name,"utf8").digest("hex");
   if(hashes.has(digest))fail("hash collision");
   hashes.add(digest);
   const oldBase=path.posix.basename(name);
   const safeBase=oldBase.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,90)||"file";
   const target=destUid+"/clients/import-"+sourceRef+"/"+digest+"/"+safeBase;
   mapping.set(name,target);
 }
 const clone=structuredClone(data);
 let references=0;
 for(const wo of clone.workorders){
   if(!wo||typeof wo!=="object")fail("invalid workorder");
   if(wo.attachments==null)continue;
   if(!Array.isArray(wo.attachments))fail("invalid workorder attachments");
   for(const att of wo.attachments){
     if(!att||typeof att.path!=="string")fail("attachment path missing");
     if(!mapping.has(att.path))fail("referenced source object missing");
     att.path=mapping.get(att.path);references++;
   }
 }
 const counts={files:objects.length,bytes,references,unique_referenced:
   new Set(data.workorders.flatMap(w=>Array.isArray(w.attachments)?w.attachments.map(a=>a.path):[])).size,
   unlinked:objects.length-new Set(data.workorders.flatMap(w=>Array.isArray(w.attachments)?w.attachments.map(a=>a.path):[])).size};
 if(counts.unlinked<0)fail("impossible object/reference count");
 // Never reassign or erase workorder identifiers, invoices, payments or totals.
 // No destination records, no owner overrides or storage bytes are changed here.
 return {source_project:sourceRef,destination_user_id:destUid,
    files:objects.map(o=>({source:o.name,target:mapping.get(o.name),size:o.size})),
    data:clone,counts,warning:"REVIEW ONLY. Verify bytes+SHA256 per transferred file and RLS signed URLs before import."};
}
if(require.main===module){
 try{
  const [inputFile,outputFile,uid]=process.argv.slice(2);
  if(!inputFile||!outputFile||!uid)fail("usage: input output destination-owner-uuid");
  const src=path.resolve(inputFile),dst=path.resolve(outputFile);
  if(src===dst||fs.existsSync(dst))fail("output must be a new file");
  const payload=JSON.parse(fs.readFileSync(src,"utf8"));
  const result=plan(payload,uid);
  fs.writeFileSync(dst,JSON.stringify(result,null,2)+"\n",{mode:0o600,flag:"wx"});
  console.log("S10_FRIEND_REMAP_PLAN_PREPARED_NO_UPLOAD "+JSON.stringify(result.counts));
 }catch(e){console.error(String(e.message||e));process.exitCode=1}
}
module.exports={plan};
