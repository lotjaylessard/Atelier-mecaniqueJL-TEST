#!/usr/bin/env node
"use strict";
/*
 * S10 offline TWO-GARAGE data merge planner. Never writes to Supabase.
 * Input from a secured private checkpoint ONLY, never commit actual data:
 * {garageA:{owner_uid,garage_id,data},garageB:{owner_uid,garage_id,data},
 *  friendStoragePlan:{destination_user_id,data,files,counts}}
 * The friendStoragePlan must come from s10-plan-friend-storage-remap.cjs.
 * Destination requires 2 existing independently authorized Auth users.
 * Output is two independent garage_data rows, NEVER mixed arrays.
 *
 * CLI: node audit/s10-plan-two-garage-merge.cjs input.json output.json
 * Private input/output must stay OFF GITHUB and OFF LOGS.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories=["clients","workorders","invoices","notes","parts","services"];
function fail(s){throw Error("S10_TWO_GARAGE_MERGE_REFUSED: "+s)}
function digest(data){return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex")}
function entry(e,label){
 if(!e||!uuid.test(e.owner_uid||"")||!uuid.test(e.garage_id||""))
    fail(label+" must have existing destination owner UID and garage UUID");
 if(!e.data||typeof e.data!=="object"||Array.isArray(e.data))fail(label+" data object required");
 for(const category of categories)if(!Array.isArray(e.data[category]))fail(label+" invalid "+category);
 if(!e.data.settings||typeof e.data.settings!=="object"||Array.isArray(e.data.settings))
   fail(label+" settings missing");
 const local=new Map();
 for(const cat of categories){
  const ids=new Set();
  for(const item of e.data[cat]){
    if(!item||typeof item!=="object"||Array.isArray(item))fail(label+" malformed "+cat+" item");
    if(item.id!==undefined&&item.id!==null){
     const key=String(item.id);
     if(!key)fail(label+" empty id in "+cat);
     if(ids.has(key))fail(label+" duplicate id in "+cat);
     ids.add(key);
    }
  }
  local.set(cat,ids.size);
 }
 return {counts:Object.fromEntries(categories.map(k=>[k,e.data[k].length])),
   hash:digest(e.data)};
}
function planTwoGarages(input){
 if(!input||typeof input!=="object")fail("input required");
 const a=input.garageA,b=input.garageB,p=input.friendStoragePlan;
 const A=entry(a,"garageA"),B=entry(b,"garageB");
 if(a.owner_uid===b.owner_uid)fail("two independent owner Auth UIDs required");
 if(a.garage_id===b.garage_id)fail("two unique garage IDs required");
 if(!p||p.destination_user_id!==b.owner_uid||
   !p.data||!Array.isArray(p.files)||!p.counts)fail("friend storage plan required and must target owner B");
 if(p.source_project!=="bdrtlveohbjwxcobeysb")fail("unknown friend source");
 if(digest(p.data)!==B.hash)fail("friend workorders not exactly the remapped data");
 const paths=new Set();
 for(const file of p.files){
  if(typeof file?.source!=="string"||typeof file?.target!=="string"||
     !file.target.startsWith(b.owner_uid+"/clients/import-bdrtlveohbjwxcobeysb/")||
     !Number.isSafeInteger(file.size)||file.size<0)fail("invalid remapped file");
  if(paths.has(file.target))fail("duplicate remapped target");
  paths.add(file.target);
 }
 if(p.files.length!==p.counts.files)fail("friend file count mismatch");
 const linked=b.data.workorders.flatMap(w=>Array.isArray(w.attachments)?w.attachments:[]);
 if(linked.length!==p.counts.references)fail("friend attachment count mismatch");
 for(const att of linked){
  if(!att||typeof att.path!=="string"||!paths.has(att.path))fail("friend attachment target absent from Storage manifest");
 }
 // Identities, numbers and financial records remain exactly as source values.
 // Multiple garages use distinct garage_data rows and garage-scoped numbering.
 const rows=[
  {garage_id:a.garage_id,user_id:a.owner_uid,data:structuredClone(a.data)},
  {garage_id:b.garage_id,user_id:b.owner_uid,data:structuredClone(b.data)}
 ];
 const sum=Object.fromEntries(categories.map(k=>[k,A.counts[k]+B.counts[k]]));
 return {mode:"PLAN_ONLY_NO_DATABASE_WRITES",rows,friend_files:structuredClone(p.files),
  counts:{garageA:A.counts,garageB:B.counts,combined:sum},
  source_hashes:{garageA:A.hash,garageB:B.hash},
  warning:"No Auth users, Storage bytes, RLS, or remote database were changed. Before GO: verify authentic owner B account, actual source hashes, destination uniqueness and backup."};
}
if(require.main===module){
 try{
   const [source,out]=process.argv.slice(2);
   if(!source||!out)fail("usage: input.json output.json");
   const input=path.resolve(source),target=path.resolve(out);
   if(input===target||fs.existsSync(target))fail("output must be a NEW file");
   const result=planTwoGarages(JSON.parse(fs.readFileSync(input,"utf8")));
   fs.writeFileSync(target,JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});
   console.log("S10_TWO_GARAGE_OFFLINE_PLAN_ONLY "+JSON.stringify(result.counts.combined));
 }catch(e){console.error(String(e.message||e));process.exitCode=1}
}
module.exports={planTwoGarages};
