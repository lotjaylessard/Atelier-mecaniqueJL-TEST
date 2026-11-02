// Tests comportementaux de A01 avec Supabase simulé. AUCUN appel réseau.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('async function commitSafeWORemoval(');
const end=html.indexOf('async function deleteWOAttachment(',start);
assert.ok(start>=0 && end>start,'Fonction A01 introuvable');
const code=html.slice(start,end);
const copy=x=>JSON.parse(JSON.stringify(x));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const baseline=()=>({
  clients:[],invoices:[],workorders:[{
    id:101,number:'BT-TEST-101',attachments:[
      {id:1001,name:'photo-a.jpg',path:'user-1/clients/test/photo-a.jpg'}
    ],description:'ne pas perdre'
  }],notes:[],links:[],parts:[],services:[],settings:{},invoiceCounter:0
});
function setup({cloudVersion=3,localVersion=3,invoice=false,writeConflict=false,changeDuringRead=false}={}) {
  const cloud=baseline();
  if(invoice) cloud.invoices.push({workOrderNumber:'BT-TEST-101'});
  const local=baseline();
  const state={cloud,local,version:cloudVersion,writeCount:0,removeCount:0,alerts:[],recovery:[],hydrated:false,confirmed:copy(local)};
  const ctx={
    SUPABASE_USER:{id:'user-1'},ACTIVE_GARAGE_ID:'garage-test',CLOUD_DATA_READY:true,
    CLOUD_SYNC_FAILED:false,CLOUD_SYNC_IN_PROGRESS:false,CLOUD_SYNC_DIRTY:false,
    CLOUD_SYNC_PENDING:false,cloudSyncTimer:null,CLOUD_CHANGE_REVISION:0,
    CLOUD_LAST_CONFIRMED_SNAPSHOT:copy(local),CLOUD_DATA_VERSION:localVersion,
    captureLocalGarageSnapshot:()=>copy(state.local),
    garageSnapshotsEquivalent:eq,
    confirm:()=>true,alert:(x)=>state.alerts.push(x),
    console:{error:()=>{},log:()=>{}},
    structuredClone,Date,clearTimeout:()=>{},
    hydrateLocalFromCloud:(next)=>{state.hydrated=true;state.local=copy(next);ctx.WORKORDERS=copy(next.workorders)},
    renderWorkOrders:()=>{},renderDashboard:()=>{},
    preserveFailedCloudSnapshot:(reason,payload)=>state.recovery.push({reason,payload}),
    WORKORDERS:copy(local.workorders),
    sb:{
      from:(table)=>{
        assert.equal(table,'garage_data');
        let operation,expected,garageId,body;
        const q={
          select:(fields)=>{ if(operation==='update') return Promise.resolve(write());operation='read';return q;},
          update:(data)=>{operation='update';body=data;return q;},
          eq:(field,value)=>{if(field==='version')expected=value;if(field==='garage_id')garageId=value;return q;},
          maybeSingle:async()=>{
            assert.equal(garageId,'garage-test');
            if(changeDuringRead){ctx.CLOUD_CHANGE_REVISION++;state.local.notes.push({id:1,text:'new'});}
            return {data:{data:copy(state.cloud),version:state.version},error:null};
          }
        };
        function write(){
          state.writeCount++;
          assert.equal(garageId,'garage-test');
          if(writeConflict||expected!==state.version)return {data:[],error:null};
          state.cloud=copy(body.data);
          state.version=body.version;
          return {data:[{garage_id:'garage-test',version:state.version}],error:null};
        }
        return q;
      },
      storage:{from:()=>{state.removeCount++;throw Error('Storage ne doit pas etre utilise');}}
    }
  };
  vm.createContext(ctx);
  vm.runInContext(code,ctx,{filename:'A01-under-test.js'});
  const run=async(id=101,attId=null)=>await vm.runInContext(
    'commitSafeWORemoval('+JSON.stringify(id)+','+JSON.stringify(attId)+')',ctx);
  return {state,ctx,run};
}
(async()=>{
  let t=setup(); assert.equal(await t.run(101,1001),true);
  assert.equal(t.state.cloud.workorders[0].attachments.length,0);
  assert.equal(t.state.removeCount,0);assert.equal(t.state.version,4);
  assert.equal(t.state.hydrated,true);console.log('OK 1 : retrait de photo, version incrementee, Storage intact');

  t=setup({cloudVersion:4});assert.equal(await t.run(101,1001),false);
  assert.equal(t.state.writeCount,0);assert.equal(t.state.removeCount,0);
  assert.equal(t.state.cloud.workorders[0].attachments.length,1);
  console.log('OK 2 : version cloud depassee, aucune suppression');

  t=setup({writeConflict:true});assert.equal(await t.run(101,1001),false);
  assert.equal(t.state.writeCount,1);assert.equal(t.state.removeCount,0);
  assert.equal(t.state.cloud.workorders[0].attachments.length,1);
  console.log('OK 3 : conflit atomique au moment de l ecriture');

  t=setup({invoice:true});assert.equal(await t.run(101),false);
  assert.equal(t.state.writeCount,0);assert.equal(t.state.cloud.workorders.length,1);
  console.log('OK 4 : suppression BT associe a facture refusee');

  t=setup();assert.equal(await t.run(101),true);
  assert.equal(t.state.cloud.workorders.length,0);assert.equal(t.state.removeCount,0);
  console.log('OK 5 : BT retire du cloud, Storage conserve');

  t=setup({changeDuringRead:true});assert.equal(await t.run(101),false);
  assert.equal(t.state.writeCount,0);assert.equal(t.state.cloud.workorders.length,1);
  console.log('OK 6 : modifications locales pendant lecture bloquent suppression');

  t=setup();t.ctx.CLOUD_SYNC_DIRTY=true;
  assert.equal(await t.run(101),false);assert.equal(t.state.writeCount,0);
  console.log('OK 7 : modifications non synchronisees bloquent suppression');

  console.log('7 tests comportementaux A01 reussis (Supabase simule).');
})().catch(e=>{console.error(e);process.exitCode=1});
