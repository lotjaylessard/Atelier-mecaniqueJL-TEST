// Tests de fusion #385 : simulation de deux sessions, aucun réseau.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const begin=html.indexOf('async function tryAutoMergeAddedWOAttachments(');
const end=html.indexOf('\nfunction scheduleCloudSync(',begin);
assert.ok(begin>=0 && end>begin,'Fonction de fusion introuvable');
const source=html.slice(begin,end);
const copy=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>JSON.stringify(x, function(k,v){return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v});
const same=(a,b)=>canonical(a)===canonical(b);
const a={id:1,name:'initial.jpg',path:'owner/initial.jpg'};
const p={id:2,name:'owner.jpg',path:'owner/owner.jpg'};
const q={id:3,name:'employee.jpg',path:'employee/employee.jpg'};
function snapshot(attachments,description='stable'){
  return {clients:[],invoices:[],notes:[],parts:[],services:[],links:[],settings:{},invoiceCounter:0,
    workorders:[{id:10,number:'BT-10',description,attachments:copy(attachments)}]};
}
async function run({base=snapshot([a]),local=snapshot([a,q]),cloud=snapshot([a,p]),cloudVersion=2,expectedVersion=1,
 collision=false,revisionChanged=false}={}){
  const state={cloud:copy(cloud),version:cloudVersion,writes:0,hydrations:0};
  const ctx={
    CLOUD_LAST_CONFIRMED_SNAPSHOT:copy(base),CLOUD_CHANGE_REVISION:revisionChanged?2:1,
    SUPABASE_USER:{id:'employee'},ACTIVE_GARAGE_ID:'garage-test',CLOUD_DATA_VERSION:expectedVersion,
    garageSnapshotsEquivalent:same,
    console:{log:()=>{},warn:()=>{}},
    hydrateLocalFromCloud:next=>{state.hydrations++;state.local=copy(next)},
    renderWorkOrders:()=>{},renderDashboard:()=>{},
    Date,
    sb:{from:table=>{
      assert.equal(table,'garage_data');
      let mode='read',versionGuard,garageId,body;
      const query={
        select(){if(mode==='update')return Promise.resolve(write());return query},
        update(data){mode='update';body=data;return query},
        eq(field,value){if(field==='garage_id')garageId=value;if(field==='version')versionGuard=value;return query},
        async maybeSingle(){assert.equal(garageId,'garage-test');return {data:{data:copy(state.cloud),version:state.version},error:null}}
      };
      function write(){
        state.writes++;assert.equal(garageId,'garage-test');
        if(collision||versionGuard!==state.version)return {data:[],error:null};
        state.cloud=copy(body.data);state.version=body.version;
        return {data:[{garage_id:'garage-test',version:state.version}],error:null};
      }
      return query;
    }}
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);
  const success=await vm.runInContext('tryAutoMergeAddedWOAttachments',ctx)(copy(local),expectedVersion,1);
  return {success,state};
}
(async()=>{
  let r=await run();assert.equal(r.success,true);
  assert.deepEqual(r.state.cloud.workorders[0].attachments.map(x=>x.name),
    ['initial.jpg','owner.jpg','employee.jpg']);
  assert.equal(r.state.version,3);
  console.log('OK 1: ajouts concurrentiels conserves');

  r=await run({local:snapshot([q])});
  assert.equal(r.success,false);assert.equal(r.state.writes,0);
  console.log('OK 2: suppression locale d un fichier initial refusee');

  r=await run({cloud:snapshot([p])});
  assert.equal(r.success,false);assert.equal(r.state.writes,0);
  console.log('OK 3: suppression distante d un fichier initial refusee');

  r=await run({local:snapshot([a,q],'modifie')});
  assert.equal(r.success,false);assert.equal(r.state.writes,0);
  console.log('OK 4: modification du BT hors fichiers refusee');

  r=await run({local:snapshot([a,{...q,path:p.path}])});
  assert.equal(r.success,false);assert.equal(r.state.writes,0);
  console.log('OK 5: collision de chemin refusee');

  r=await run({local:snapshot([a,{...q,id:2}])});
  assert.equal(r.success,false);assert.equal(r.state.writes,0);
  console.log('OK 6: collision de ID refusee');

  r=await run({collision:true});assert.equal(r.success,false);
  assert.equal(r.state.hydrations,0);
  console.log('OK 7: trois collisions CAS refusent fusion');

  r=await run({revisionChanged:true});assert.equal(r.success,false);
  assert.equal(r.state.writes,0);
  console.log('OK 8: revision locale changee refusee');

  console.log('8 scenarios #385 executes sans connexion a Supabase.');
})().catch(err=>{console.error(err);process.exitCode=1});
