#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const {plan}=require("./s10-plan-friend-storage-remap.cjs");
const {planTwoGarages}=require("./s10-plan-two-garage-merge.cjs");
const ua="00000000-0000-4000-8000-000000000001";
const ub="00000000-0000-4000-8000-000000000002";
const ga="10000000-0000-4000-8000-000000000001";
const gb="10000000-0000-4000-8000-000000000002";
const make=(n,kind)=>Array.from({length:n},(_,i)=>({id:kind+"-"+i,number:kind+"-N"+i,total:0,status:"en_cours"}));
const A={clients:make(42,"CL"),workorders:make(88,"BT"),invoices:make(87,"FA"),
 notes:[],parts:[],services:[],settings:{invoiceCounter:87}};
const B={clients:make(9,"CL"),workorders:make(16,"BT").map((w,i)=>({
 ...w,attachments:i<12?[{id:"a"+i,path:"clients/subject-"+i+"/ticket.png"}]:[]
 })),invoices:make(15,"FA").map((x,i)=>({...x,amount:i===1?0:123.45,paid:i%3===0})),
 notes:make(3,"N"),parts:make(8,"P"),services:make(5,"S"),settings:{invoiceCounter:15}};
const objects=Array.from({length:19},(_,i)=>({name:i<12?
 "clients/subject-"+i+"/ticket.png":"clients/orphan-"+i+"/receipt.jpg",size:200+i}));
const fp=plan({data:B,objects},ub);
const input={garageA:{owner_uid:ua,garage_id:ga,data:A},
 garageB:{owner_uid:ub,garage_id:gb,data:fp.data},friendStoragePlan:fp};
const copy=structuredClone(input);
const output=planTwoGarages(input);
assert.deepEqual(input,copy);
assert.equal(output.rows.length,2);
assert.equal(output.counts.combined.clients,51);
assert.equal(output.counts.combined.workorders,104);
assert.equal(output.counts.combined.invoices,102);
assert.equal(output.counts.combined.parts,8);
assert.equal(output.counts.combined.services,5);
assert.equal(output.counts.combined.notes,3);
assert.equal(output.friend_files.length,19);
assert.deepEqual(output.rows[0].data,A);
assert.deepEqual(output.rows[1].data,fp.data);
assert.deepEqual(output.rows[1].data.invoices,B.invoices);
assert.equal(output.rows[1].data.invoices[1].amount,0);
assert.equal(output.rows[1].data.workorders[0].id,"BT-0");
assert.equal(output.rows[0].data.workorders[0].id,"BT-0");
assert.notEqual(output.rows[0].garage_id,output.rows[1].garage_id);
assert.notEqual(output.rows[0].user_id,output.rows[1].user_id);
assert.throws(()=>planTwoGarages({...input,garageB:{...input.garageB,owner_uid:ua}}),/two independent owner/);
assert.throws(()=>planTwoGarages({...input,garageB:{...input.garageB,garage_id:ga}}),/two unique garage/);
assert.throws(()=>planTwoGarages({...input,garageB:{...input.garageB,data:B}}),/not exactly the remapped data/);
assert.throws(()=>planTwoGarages({...input,friendStoragePlan:{...fp,files:fp.files.slice(1)}}),/friend file count mismatch/);
const missing=structuredClone(input);missing.garageB.data.workorders[0].attachments[0].path="invalid/path";
assert.throws(()=>planTwoGarages(missing),/not exactly the remapped data/);
const dup=structuredClone(input);dup.garageB.data.clients[1].id=dup.garageB.data.clients[0].id;
assert.throws(()=>planTwoGarages(dup),/duplicate id/);
console.log("S10_TWO_GARAGE_MERGE_PLAN_PASS : separate owner rows, 51 clients, 104 BT, 102 invoices, 19 friend files, zero writes");
