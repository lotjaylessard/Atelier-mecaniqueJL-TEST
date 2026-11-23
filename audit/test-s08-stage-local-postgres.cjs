"use strict";
// Tests de l'import en quarantaine, sans PostgreSQL et sans données personnelles.
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto"),cp=require("node:child_process");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"s08-stage-test-"));
const backup=path.join(root,"backup"),bin=path.join(root,"bin"),capture=path.join(root,"captured.sql");
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
fs.mkdirSync(backup);fs.mkdirSync(bin);
const snapshot={format:"atelier-test-full-garage-snapshot-v1",accountId:"owner",createdAt:"2026-11-23T12:00:00Z",garages:[{garage_id:"garage",user_id:"owner",data:{workorders:[{attachments:[{path:"owner/test.pdf"}]}]}}],quotes:[{id:"quote1",garage_id:"garage"}],operational:{garage_timer_sessions:[{id:"timer1",garage_id:"garage",user_id:"owner"}],garage_calendar_notes:[],garage_schedule_events:[]}};
const file=Buffer.from("fixture PDF bytes"),raw=Buffer.from(JSON.stringify(snapshot));
const manifest={format:"atelier-test-physical-backup-v1",source:"Supabase TEST",bucket:"wo-files",status:"INCOMPLETE",missingTables:["garage_timer_sessions","garage_calendar_notes","garage_schedule_events"],failed:[],unresolvedReferences:[],accountId:"owner",garageId:"garage",memberIds:["owner"],createdAt:snapshot.createdAt,quoteCount:1,operationalCounts:{garage_timer_sessions:1,garage_calendar_notes:0,garage_schedule_events:0},snapshotBytes:raw.length,snapshotSha256:sha(raw),referencedPaths:1,ownedPathList:["owner/test.pdf"],ownedPaths:1,files:[{path:"owner/test.pdf",bytes:file.length,sha256:sha(file),referenced:true}],fileCount:1,totalBytes:file.length};
const stub=path.join(bin,"sudo");
fs.writeFileSync(stub,'#!/bin/sh\ncat > "$S08_CAPTURE_SQL"\necho "mock local psql success"\n');
fs.chmodSync(stub,0o755);
function write(){fs.writeFileSync(path.join(backup,"manifest.json"),JSON.stringify(manifest));fs.writeFileSync(path.join(backup,"garage-data.json"),raw)}
function run(){fs.rmSync(capture,{force:true});return cp.spawnSync(process.execPath,[path.join(__dirname,"s08-stage-local-postgres.cjs"),backup],{encoding:"utf8",env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,S08_CAPTURE_SQL:capture}})}
try{
 fs.mkdirSync(path.join(backup,"files","owner"),{recursive:true});
 fs.writeFileSync(path.join(backup,"files","owner","test.pdf"),file);
 write();
 let r=run();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/S08_STAGING_OK/);
 let sql=fs.readFileSync(capture,"utf8");assert.match(sql,/s08_quarantine\.snapshots/);assert.match(sql,/decode\(\x27[0-9a-f]+\x27,\x27hex\x27\)/);
 console.log("staging: valid partial snapshot staged into quarantine");
 manifest.failed=[{path:"owner/test.pdf",error:"download"}];write();r=run();assert.notEqual(r.status,0);assert.ok(!fs.existsSync(capture));console.log("staging: failed manifest rejected before database access");
 manifest.failed=[];manifest.snapshotSha256="0".repeat(64);write();r=run();assert.notEqual(r.status,0);assert.ok(!fs.existsSync(capture));console.log("staging: tampered JSON rejected before database access");
 manifest.snapshotSha256=sha(raw);write();fs.writeFileSync(path.join(backup,"files","owner","test.pdf"),Buffer.from("tampered"));r=run();assert.notEqual(r.status,0);assert.ok(!fs.existsSync(capture));console.log("staging: tampered attachment rejected before database access");
}finally{fs.rmSync(root,{recursive:true,force:true})}
