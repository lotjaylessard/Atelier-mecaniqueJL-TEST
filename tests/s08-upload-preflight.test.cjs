'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const html=readFileSync(join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('function initWorkOrderAttachments(wo){');
const end=html.indexOf('function renderWorkOrderAttachments(wo){',start);
assert.ok(start>=0&&end>start,'Attachment module missing');
const source=html.slice(start,end);
test('upload checks cloud identity and synchronization before Storage upload',()=>{
 const guard=source.indexOf('if (!sb || !SUPABASE_USER?.id || !ACTIVE_GARAGE_ID ||');
 const upload=source.indexOf('.upload(filePath, file)');
 assert.ok(guard>0 && upload>guard);
 for(const state of ['CLOUD_DATA_READY','CLOUD_SYNC_FAILED','CLOUD_SYNC_IN_PROGRESS',
  'CLOUD_SYNC_PENDING','CLOUD_SYNC_DIRTY','cloudSyncTimer'])
   assert.ok(source.slice(guard,upload).includes(state),state+' guard absent');
});
test('invalid names and empty file sizes blocked before upload',()=>{
 const upload=source.indexOf('.upload(filePath, file)');
 const validations=source.slice(0,upload);
 assert.match(validations,/file\.size <= 0/);
 assert.match(validations,/Number\.isSafeInteger\(file\.size\)/);
 assert.match(validations,/\.test\(file\.name\)/);
 assert.match(validations,/Fichier ignoré/);
});
test('failed Storage upload does not append the attachment reference',()=>{
 const upload=source.indexOf('.upload(filePath, file)');
 const onError=source.indexOf('if (error)',upload);
 const skip=source.indexOf('continue;',onError);
 const append=source.indexOf('wo.attachments.push(',upload);
 assert.ok(upload>=0&&onError>upload&&skip>onError&&append>skip);
});
test('locked BT disables file input and never sets upload handler',()=>{
 assert.match(source,/input\.disabled = locked/);
 assert.match(source,/if \(locked\) return/);
});
