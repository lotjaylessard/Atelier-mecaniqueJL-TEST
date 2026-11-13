'use strict';
// S08: isolated, offline verification of synthetic backup + physical files.
// This does NOT enable the garage import button or touch Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join, resolve, sep} = require('node:path');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = {
  'u1/g1/workorder/photo.jpg': Buffer.from('FAKE-IMAGE-BYTES-001'),
  'u1/g1/workorder/report.pdf': Buffer.from('FAKE-PDF-BYTES-002')
};
function makeBackup() {
  return {
    format:'atelier-test-full-data-v2',garageId:'g1',userId:'u1',cloudVersion:9,
    data:{
      clients:[{id:'c1',vehicles:[{id:'v1',km:12000}]}],
      workorders:[{id:'bt1',number:'BT-001',attachments:Object.keys(files).map(path=>({path,name:path.split('/').pop()}))}],
      invoices:[{number:'FA-001',status:'paid',paidAmount:100,total:100,payments:[{amount:100}]}],
      notes:[{id:'n1',body:'notes preservees'}],
      links:[{id:'l1'}],parts:[{id:'p1'}],services:[{id:'s1'}],
      settings:{gst:5,qst:9.975},invoiceCounter:2
    },
    quotes:[{id:'q1',user_id:'u1',garage_id:'g1',quote_number:'SO-001'}],
    attachments:{
      bucket:'wo-files',bytesIncluded:false,
      files:Object.entries(files).map(([path,bytes])=>({path,size:bytes.length,sha256:sha(bytes)}))
    }
  };
}
function verifyAndStage(backup, downloaded, destination) {
  if(backup?.format!=='atelier-test-full-data-v2' ||
     backup?.userId!=='u1' || backup?.garageId!=='g1')
    throw Error('wrong backup identity or format');
  const required=['clients','invoices','workorders','notes','links','parts','services'];
  if(!required.every(k=>Array.isArray(backup.data?.[k])) ||
     !backup.data.settings || !Number.isSafeInteger(backup.data.invoiceCounter) ||
     !Array.isArray(backup.quotes))
    throw Error('incomplete structured backup');
  const refs=backup.data.workorders.flatMap(wo=>(wo.attachments||[]).map(a=>a.path));
  if(new Set(refs).size!==refs.length)throw Error('duplicate reference');
  const inventory=backup.attachments?.files;
  if(!Array.isArray(inventory) || backup.attachments.bucket!=='wo-files' ||
     inventory.length!==refs.length)
    throw Error('manifest mismatch');
  const staged=[];
  for(const entry of inventory) {
    if(typeof entry.path!=='string' || !refs.includes(entry.path) ||
       !entry.path.startsWith('u1/g1/') || entry.path.includes('\\') ||
       entry.path.split('/').some(part=>part==='..'||part==='.'||part==='') ||
       !/^[0-9a-f]{64}$/.test(entry.sha256))
      throw Error('unsafe path or manifest entry');
    const bytes=downloaded[entry.path];
    if(!Buffer.isBuffer(bytes))throw Error('missing physical file');
    if(bytes.length!==entry.size || sha(bytes)!==entry.sha256)
      throw Error('physical file corrupt');
    const target=resolve(destination,entry.path);
    if(!target.startsWith(resolve(destination)+sep))throw Error('directory traversal');
    staged.push([target,bytes]);
  }
  if(new Set(inventory.map(x=>x.path)).size!==inventory.length)
    throw Error('duplicate manifest item');
  // Stage only after ALL files pass validation: no partial recovery on failure.
  for(const [target,bytes] of staged){
    mkdirSync(require('node:path').dirname(target),{recursive:true});
    writeFileSync(target,bytes,{flag:'wx'});
  }
  const output={...backup,data:JSON.parse(JSON.stringify(backup.data)),quotes:JSON.parse(JSON.stringify(backup.quotes))};
  return output;
}
function inSandbox(fn){
 const root=mkdtempSync(join(tmpdir(),'s08-restore-'));
 try{return fn(root);}finally{rmSync(root,{recursive:true,force:true});}
}
function expectFailure(mutator,errorMessage){
 inSandbox(root=>{
   const b=makeBackup(),objects={...files};
   mutator(b,objects);
   assert.throws(()=>verifyAndStage(b,objects,root),errorMessage);
   assert.equal(existsSync(join(root,'u1')),false,'failed validation must not stage partial files');
 });
}
test('complete JSON structures and physical bytes recovered in isolated directory',()=>inSandbox(root=>{
 const b=makeBackup(),next=verifyAndStage(b,files,root);
 assert.deepEqual(next.data,b.data);
 assert.deepEqual(next.quotes,b.quotes);
 for(const [path,bytes] of Object.entries(files))
   assert.deepEqual(readFileSync(join(root,path)),bytes);
}));
test('one absent attachment blocks entire recovery',()=>expectFailure((b,obj)=>{
 delete obj['u1/g1/workorder/report.pdf'];
},/missing physical file/));
test('one altered byte blocks entire recovery',()=>expectFailure((b,obj)=>{
 obj['u1/g1/workorder/report.pdf']=Buffer.from('TAMPERED');
},/physical file corrupt/));
test('other account backup blocked',()=>expectFailure(b=>{b.userId='u2';},/identity/));
test('missing notes blocks recovery',()=>expectFailure(b=>{delete b.data.notes;},/incomplete structured/));
test('duplicate attachment blocks recovery',()=>expectFailure(b=>{
 b.attachments.files.push({...b.attachments.files[0]});
 b.data.workorders[0].attachments.push({...b.data.workorders[0].attachments[0]});
},/duplicate reference/));
test('path traversal blocked',()=>expectFailure(b=>{
 b.attachments.files[0].path='u1/g1/../../escape';
 b.data.workorders[0].attachments[0].path=b.attachments.files[0].path;
},/unsafe path/));
test('foreign Storage path blocked',()=>expectFailure(b=>{
 b.attachments.files[0].path='u2/g1/workorder/photo.jpg';
 b.data.workorders[0].attachments[0].path=b.attachments.files[0].path;
},/unsafe path/));
test('corrupt checksum blocked',()=>expectFailure(b=>{
 b.attachments.files[0].sha256='0'.repeat(64);
},/physical file corrupt/));
