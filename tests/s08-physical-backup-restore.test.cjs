'use strict';
// S08: exercise offline Python restore rehearsal with only fictional bytes.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');

const script=path.join(__dirname,'..','audit','s08-verify-physical-backup.py');
function fixture(){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'s08-physical-fixture-'));
 const name='u1/clients/fixture/doc.txt',bytes=Buffer.from('purely fictional content');
 fs.mkdirSync(path.join(folder,'files',path.dirname(name)),{recursive:true});
 fs.writeFileSync(path.join(folder,'files',name),bytes);
 const snapshot={
  format:'atelier-test-full-garage-snapshot-v1',accountId:'u1',
  garages:[{user_id:'u1',garage_id:'g1',version:1,data:{
   notes:[{id:'n1',body:'fiction'}],
   workorders:[{number:'BT-1',attachments:[{path:name}]}],
   clients:[],invoices:[],links:[],parts:[],services:[],settings:{},invoiceCounter:1
  }}],
  quotes:[{user_id:'u1',id:'q1',quote_number:'SO-1'}]
 };
 const manifest={
  format:'atelier-test-physical-backup-v1',
  accountId:'u1',status:'COMPLETE',bytesIncluded:true,failed:[],unresolvedReferences:[],
  garageCount:1,quoteCount:1,referencedPaths:1,
  fileCount:1,totalBytes:bytes.length,
  files:[{path:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),referenced:true}]
 };
 const save=()=>{fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest));fs.writeFileSync(path.join(folder,'garage-data.json'),JSON.stringify(snapshot));};
 save();
 return {folder,name,manifest,snapshot,save,dispose:()=>fs.rmSync(folder,{recursive:true,force:true})};
}
function run(folder){
 return spawnSync(process.env.S08_PYTHON||'python3',[script,folder],{encoding:'utf8',timeout:20000});
}
test('isolated restore of fictional backup with SHA-256 succeeds',()=>{
 const x=fixture();try{
  const result=run(x.folder);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/PASS/);
  assert.match(result.stdout,/Fichiers vérifiés : 1/);
 }finally{x.dispose()}
});
test('missing physical bytes abort isolated restore',()=>{
 const x=fixture();try{
  fs.unlinkSync(path.join(x.folder,'files',x.name));
  const r=run(x.folder);
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/FAIL/);
 }finally{x.dispose()}
});
test('modified physical bytes abort isolated restore',()=>{
 const x=fixture();try{
  fs.writeFileSync(path.join(x.folder,'files',x.name),'corrupted');
  const r=run(x.folder);
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/FAIL/);
 }finally{x.dispose()}
});
test('incomplete manifest never passes restore check',()=>{
 const x=fixture();try{
  x.manifest.status='INCOMPLETE';x.save();
  const r=run(x.folder);
  assert.notEqual(r.status,0);
 }finally{x.dispose()}
});
test('BT attachment reference missing from backup is rejected',()=>{
 const x=fixture();try{
  x.snapshot.garages[0].data.workorders[0].attachments.push({path:'u1/clients/lost.pdf'});
  x.manifest.referencedPaths=2;x.save();
  const r=run(x.folder);
  assert.notEqual(r.status,0);
 }finally{x.dispose()}
});
test('manifest with traversal file path is rejected',()=>{
 const x=fixture();try{
  x.manifest.files[0].path='../outside.txt';x.save();
  const r=run(x.folder);
  assert.notEqual(r.status,0);
 }finally{x.dispose()}
});
test('another account in the JSON is rejected',()=>{
 const x=fixture();try{
  x.snapshot.quotes[0].user_id='other-user';x.save();
  const r=run(x.folder);
  assert.notEqual(r.status,0);
 }finally{x.dispose()}
});
