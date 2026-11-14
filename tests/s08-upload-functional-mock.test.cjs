'use strict';
// S08: exercise the REAL initWorkOrderAttachments function from index.html
// with mocked cloud and Storage. Never touches physical customer files.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('function initWorkOrderAttachments(wo){');
const end=html.indexOf('function renderWorkOrderAttachments(wo){',start);
assert.ok(start>=0 && end>start,'BT attachment code anchors missing');
const source=html.slice(start,end);

async function runCase({cloudReady=true,serverVersion=5,storageError=false,fileName='test.pdf',fileSize=50,accountSwapsOnUpload=false}={}){
  const calls={uploads:0,saves:0,alerts:[],versions:0};
  const local={clients:[],invoices:[],workorders:[],notes:[],links:[],parts:[],services:[],settings:{},invoiceCounter:0};
  const wo={id:'w1',number:'BT-01',clientName:'Test',vehicleLabel:'Auto',attachments:[]};
  const input={disabled:false,files:[{name:fileName,size:fileSize,type:'application/pdf'}],value:'file'};
  const recovered=[];
  const sandbox={
    document:{getElementById:id=>id==='woFileInput'?input:id==='woAttachmentsList'?{}:null},
    isWorkOrderLocked:()=>false,
    renderWorkOrderAttachments:()=>{},
    SUPABASE_USER:{id:'u1'},ACTIVE_GARAGE_ID:'g1',
    CLOUD_DATA_READY:cloudReady,
    CLOUD_SYNC_FAILED:false,CLOUD_SYNC_IN_PROGRESS:false,
    CLOUD_SYNC_PENDING:false,CLOUD_SYNC_DIRTY:false,cloudSyncTimer:null,
    CLOUD_DATA_VERSION:5,CLOUD_CHANGE_REVISION:1,
    CLOUD_LAST_CONFIRMED_SNAPSHOT:local,
    captureLocalGarageSnapshot:()=>local,
    garageSnapshotsEquivalent:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    sb:{
      from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{
        calls.versions++;return {data:{version:serverVersion},error:null};
      }})})}),
      storage:{from:()=>({upload:async()=>{
        calls.uploads++;
        if(accountSwapsOnUpload)sandbox.SUPABASE_USER.id='new-user';
        return storageError?{error:{message:'storage denied'}}:{error:null};
      }})}
    },
    sanitize:s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'-'),
    saveWorkOrders:()=>{calls.saves++;},
    alert:message=>calls.alerts.push(message),
    console:{warn:()=>{},error:()=>{}},
    TEST_STORAGE_PREFIX:'garage-audit-test',
    localStorage:{setItem:(key,value)=>recovered.push({key,value:JSON.parse(value)})},
    window:{}
  };
  vm.runInNewContext(source+'\nthis.init=initWorkOrderAttachments;',sandbox);
  sandbox.init(wo);
  if(typeof input.onchange==='function')await input.onchange.call(input);
  return {calls,wo,input,recovered};
}

test('no cloud session means no upload or BT reference',async()=>{
  const {calls,wo}=await runCase({cloudReady:false});
  assert.equal(calls.uploads,0);assert.equal(wo.attachments.length,0);
  assert.ok(calls.alerts.length>0);
});
test('stale cloud version refuses upload before bytes leave browser',async()=>{
  const {calls,wo}=await runCase({serverVersion:6});
  assert.equal(calls.versions,1);assert.equal(calls.uploads,0);
  assert.equal(wo.attachments.length,0);
});
test('Storage failure never appends a reference',async()=>{
  const {calls,wo}=await runCase({storageError:true});
  assert.equal(calls.uploads,1);assert.equal(calls.saves,0);
  assert.equal(wo.attachments.length,0);
});
test('successful Storage upload appends one reference and schedules sync',async()=>{
  const {calls,wo}=await runCase();
  assert.equal(calls.uploads,1);assert.equal(calls.saves,1);
  assert.equal(wo.attachments.length,1);
  assert.match(wo.attachments[0].path,/^u1\/clients\//);
});
test('unsafe file name is rejected before cloud Storage upload',async()=>{
  const {calls,wo}=await runCase({fileName:'../bad.pdf'});
  assert.equal(calls.uploads,0);assert.equal(wo.attachments.length,0);
});
test('empty physical file is rejected before cloud Storage upload',async()=>{
  const {calls,wo}=await runCase({fileSize:0});
  assert.equal(calls.uploads,0);assert.equal(wo.attachments.length,0);
});

test('account change during Storage upload preserves recovery without wrong BT link',async()=>{
 const {calls,wo,recovered}=await runCase({accountSwapsOnUpload:true});
 assert.equal(calls.uploads,1);
 assert.equal(calls.saves,0);
 assert.equal(wo.attachments.length,0);
 assert.equal(recovered.length,1);
 assert.equal(recovered[0].value.userId,'u1');
 assert.equal(recovered[0].value.garageId,'g1');
 assert.match(recovered[0].value.storagePath,/^u1\/clients\//);
 assert.ok(calls.alerts.length>0);
});
