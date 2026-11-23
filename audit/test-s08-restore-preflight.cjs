"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const script=path.join(__dirname,"s08-restore-preflight.cjs");
const base=fs.mkdtempSync(path.join(os.tmpdir(),"s08-restore-"));
const sha=buf=>crypto.createHash("sha256").update(buf).digest("hex");
const snapshot={format:"atelier-test-full-garage-snapshot-v1",accountId:"owner",createdAt:"2026-11-23T00:00:00Z",garages:[{garage_id:"garage",user_id:"owner",data:{workorders:[]}}],quotes:[],operational:{garage_timer_sessions:[],garage_calendar_notes:[],garage_schedule_events:[]}};
const data=Buffer.from(JSON.stringify(snapshot));
const manifest={format:"atelier-test-physical-backup-v1",source:"Supabase TEST",bucket:"wo-files",status:"COMPLETE",missingTables:[],failed:[],unresolvedReferences:[],accountId:"owner",garageId:"garage",memberIds:["owner"],referencedPaths:0,createdAt:snapshot.createdAt,snapshotBytes:data.length,snapshotSha256:sha(data),quoteCount:0,operationalCounts:{garage_timer_sessions:0,garage_calendar_notes:0,garage_schedule_events:0},files:[],fileCount:0,totalBytes:0,ownedPathList:[],ownedPaths:0};
function write(){fs.writeFileSync(path.join(base,"manifest.json"),JSON.stringify(manifest));fs.writeFileSync(path.join(base,"garage-data.json"),data)}
function run(){return spawnSync(process.execPath,[script,base],{encoding:"utf8"})}
try{
 write();assert.equal(run().status,0,"Valid fixture should pass");console.log("preflight: valid fixture OK");
 manifest.status="INCOMPLETE";write();assert.notEqual(run().status,0);console.log("preflight: incomplete rejected");
 manifest.status="COMPLETE";manifest.missingTables=["garage_calendar_notes"];write();assert.notEqual(run().status,0);console.log("preflight: missing table rejected");
 manifest.missingTables=[];manifest.snapshotSha256="0".repeat(64);write();assert.notEqual(run().status,0);console.log("preflight: checksum mismatch rejected");
 manifest.snapshotSha256=sha(data);manifest.files=[{path:"../escape",bytes:0,sha256:sha(Buffer.alloc(0))}];manifest.fileCount=1;write();assert.notEqual(run().status,0);console.log("preflight: traversal rejected");
}finally{fs.rmSync(base,{recursive:true,force:true})}
