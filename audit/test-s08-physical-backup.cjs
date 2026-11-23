"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const crypto=require("node:crypto");
const source=fs.readFileSync(require("node:path").join(__dirname,"s08-physical-backup.js"),"utf8");
const context={crypto:crypto.webcrypto,TextDecoder,Uint8Array,ArrayBuffer,Set,Map,Date,JSON,Error};
context.globalThis=context;
vm.runInNewContext(source,context);
const backup=context.S08PhysicalBackup.backup;
function directory(){
 const files=new Map(),dirs=new Map();
 return {files,async getDirectoryHandle(name){if(!dirs.has(name))dirs.set(name,directory());return dirs.get(name)},
 async getFileHandle(name){return {async createWritable(){let content;return {async write(value){content=Buffer.from(value)},async close(){files.set(name,content)},async abort(){}}},async getFile(){const data=files.get(name);if(!data)throw Error("Missing "+name);return {async arrayBuffer(){return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)},async text(){return data.toString("utf8")}}}}}};
}
function client({duplicate=false,changed=false}={}){
 const uid="owner-A",garage="garage-A";
 const members=duplicate?[{user_id:uid},{user_id:uid}]:[{user_id:uid}];
 const operational=["garage_timer_sessions","garage_calendar_notes","garage_schedule_events"];
 let reads=0;
 return {auth:{async getUser(){return {data:{user:{id:uid}}}}},
 storage:{from(){return {async download(){throw Error("unexpected download")}}}},
 from(table){return {select(){return this},eq(){return this},async range(){
 if(table==="garage_members")return {data:[{garage_id:garage,user_id:uid,role:"owner"}]};
 if(table==="garage_data")return {data:[{garage_id:garage,user_id:uid,data:{workorders:[]},version:1,updated_at:"2026-11-23"}]};
 if(operational.includes(table)){if(table==="garage_calendar_notes"&&changed&&++reads>1)return {data:[{id:"n1",garage_id:garage,user_id:uid}]};return {data:[]}}
 throw Error("Unexpected table "+table);
 }}}},
 rpc(name){const data=name==="backup_garage_member_ids"?members:[];return {data,error:null,async range(){return {data}}}}
 };
}
(async()=>{
 const root=directory();
 const manifest=await backup(client(),root);
 assert.equal(manifest.status,"INCOMPLETE");
 assert.deepEqual(Array.from(manifest.missingTables),["garage_timer_sessions","garage_calendar_notes","garage_schedule_events"]);
 assert.equal(manifest.operationalCounts.garage_calendar_notes,0);
 assert.equal(manifest.failed.length,0);
 const saved=[...root.files.keys()];
 assert.equal(saved.length,0);
 console.log("S08 exporter: incomplete manifest retained, operational counts OK");
 await assert.rejects(()=>backup(client({duplicate:true}),directory()),/dupliqués/);
 console.log("S08 exporter: duplicate members rejected");
 const changedResult=await backup(client({changed:true}),directory());
 assert.equal(changedResult.status,"INCOMPLETE");
 assert.ok(changedResult.failed.some(f=>f.path==="garage_calendar_notes"));
 console.log("S08 exporter: operational change detected");
})().catch(e=>{console.error(e);process.exitCode=1});
