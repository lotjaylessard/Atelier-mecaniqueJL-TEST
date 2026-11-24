#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const {plan}=require("./s10-plan-friend-storage-remap.cjs");
const uidA="00000000-0000-4000-8000-000000000001";
const uidB="00000000-0000-4000-8000-000000000002";
const workorders=Array.from({length:16},(_,i)=>({
 id:"BT-"+i,attachments:i<12?[{id:"A-"+i,path:"clients/client-"+i+"/photo.jpg"}]:[]
}));
const payload={data:{clients:[{id:"CL-1"}],workorders,invoices:[{id:"FA-1",paid:true,total:98.21}]},
 objects:Array.from({length:19},(_,i)=>({name:i<12?"clients/client-"+i+"/photo.jpg":
 "clients/unused-"+i+"/photo.jpg",size:100+i}))};
const oldCopy=structuredClone(payload);
const output=plan(payload,uidB);
assert.deepEqual(payload,oldCopy,"Never mutate source data");
assert.equal(output.counts.files,19);
assert.equal(output.counts.references,12);
assert.equal(output.counts.unlinked,7);
assert.equal(output.counts.bytes,Array.from({length:19},(_,i)=>100+i).reduce((a,b)=>a+b,0));
assert.equal(new Set(output.files.map(x=>x.target)).size,19);
assert.ok(output.files.every(x=>x.target.startsWith(uidB+"/clients/import-bdrtlveohbjwxcobeysb/")));
assert.equal(output.data.workorders[0].attachments[0].path,output.files[0].target);
assert.deepEqual(output.data.invoices,payload.data.invoices);
assert.deepEqual(output.data.clients,payload.data.clients);
assert.equal(plan(payload,uidB).files[0].target,output.files[0].target,"Mapping must be deterministic");
assert.notEqual(plan(payload,uidA).files[0].target,output.files[0].target,"Garage owner must isolate namespace");
assert.throws(()=>plan({...payload,objects:payload.objects.slice(1)},uidB),/referenced source object missing/);
assert.throws(()=>plan({...payload,objects:[...payload.objects,payload.objects[0]]},uidB),/duplicate source object/);
assert.throws(()=>plan({...payload,objects:payload.objects.map((x,i)=>i===0?{...x,name:"clients/../escape"}:x)},uidB),/unsafe source path/);
assert.throws(()=>plan(payload,"invalid"),/destination user UUID/);
assert.throws(()=>plan({...payload,objects:payload.objects.map((x,i)=>i===0?{...x,size:-1}:x)},uidB),/missing object byte size/);
console.log("S10_FRIEND_OFFLINE_19_FILES_12_REFERENCES_7_UNLINKED_REMAP_PASS");
