// S08 - Tests du vrai chemin JS de fermeture atomique (sans Supabase ni navigateur).
// Usage: node audit/s08-bt-atomic-recovery.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const begin = html.indexOf('async function s08FinishWorkOrderAtomicTest({');
const end = html.indexOf('let finishingWorkOrder=false;', begin);
assert.ok(begin !== -1 && end > begin, 'Fonction S08 introuvable dans le code TEST');
assert.match(html, /const S08_BT_ATOMIC_TEST_ENABLED = true;/,
  'Les tests ciblent la branche atomique generalisee en TEST');

const source = html.slice(begin, end);
const factory = new Function('env', 'with(env){' + source + ';return s08FinishWorkOrderAtomicTest;}');
const copy = x => JSON.parse(JSON.stringify(x));
const baseline = {workorders:[], invoices:[], clients:[], settings:{}};
const params = {
  wo:{id:'wo1',number:'BT-FICTIF'}, invoice:{number:'FA-FICTIF',workOrderNumber:'BT-FICTIF'},
  expectedGarage:'g',expectedUser:'u',expectedVersion:2,expectedRevision:3
};

function fakeGarage(mode) {
  let local = copy(baseline);
  const calls=[], alerts=[], backups=[], events=[];
  const env = {
    S08_BT_ATOMIC_TEST_ENABLED:true, S08_BT_ATOMIC_TEST_GARAGE_ID:'g',
    S08_BT_ATOMIC_TEST_USER_ID:'u',
    CLOUD_DATA_READY:true,CLOUD_DATA_VERSION:2,CLOUD_CHANGE_REVISION:3,
    CLOUD_LAST_CONFIRMED_SNAPSHOT:copy(baseline),
    SUPABASE_USER:{id:'u'},ACTIVE_GARAGE_ID:'g',INVOICES:[],WORKORDERS:[],
    hasUnconfirmedCloudChanges:()=>mode==='pending',
    captureLocalGarageSnapshot:()=>copy(local),
    garageSnapshotsEquivalent:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    preserveFailedCloudSnapshot:(reason,data)=>backups.push({reason,data:copy(data)}),
    renderWorkOrders:()=>events.push('render'),
    renderInvoiceList:()=>events.push('renderInvoices'),
    showPage:()=>events.push('page'),
    openInvoiceEditModal:()=>events.push('modal'),
    console:{error(){},warn(){}}, alert:x=>alerts.push(x),
    loadCloudData:async()=>{
      events.push('reload');
      if(mode==='reloadFailed') return false;
      env.CLOUD_DATA_READY=true;
      env.CLOUD_DATA_VERSION=3;
      env.CLOUD_LAST_CONFIRMED_SNAPSHOT=copy(local);
      if(['normal','networkCommitted','localEdits'].includes(mode)) {
        env.INVOICES=[{number:'FA-FICTIF',workOrderNumber:'BT-FICTIF'}];
        env.WORKORDERS=[{id:'wo1',status:'termine'}];
      }
      return true;
    }
  };
  env.sb={rpc:async(_name,args)=>{
    calls.push(args.p_dry_run?'simulation':'ecriture');
    if(args.p_dry_run) {
      return mode==='simulationRefusee'?{error:{message:'test refuse'}}
        :{data:{dryRun:true,workOrderNumber:'BT-FICTIF',
          invoiceNumber:'FA-FICTIF',garageVersion:2}};
    }
    if(mode==='localEdits') local.notes=['note non synchronisee'];
    if(['networkCommitted','networkNotCommitted','reloadFailed'].includes(mode))
      return {error:{message:'connexion interrompue'}};
    return {data:{dryRun:false,workOrderNumber:'BT-FICTIF',
      invoiceNumber:'FA-FICTIF',garageVersion:3}};
  }};
  return {env,calls,alerts,backups,events};
}

async function runCase(mode) {
  const s=fakeGarage(mode);
  let error='';
  try {await factory(s.env)(copy(params));}
  catch(e) {error=String(e.message||e);}
  const count=x=>s.events.filter(v=>v===x).length;
  switch(mode) {
    case 'normal':
      assert.equal(error,'');assert.equal(count('modal'),1);
      assert.deepEqual(s.calls,['simulation','ecriture']);break;
    case 'networkCommitted':
      assert.equal(error,'');assert.equal(count('modal'),1);
      assert.equal(count('reload'),1);assert.equal(s.alerts.length,1);
      assert.deepEqual(s.calls,['simulation','ecriture']);break;
    case 'networkNotCommitted':
      assert.match(error,/non confirmee/);assert.equal(count('modal'),0);
      assert.equal(count('reload'),1);break;
    case 'simulationRefusee':
      assert.match(error,/Simulation atomique refusee/);
      assert.deepEqual(s.calls,['simulation']);break;
    case 'pending':
      assert.match(error,/Etat local non confirme/);
      assert.equal(s.calls.length,0);break;
    case 'localEdits':
      assert.match(error,/non confirmee/);
      assert.equal(s.backups.length,1);
      assert.equal(count('reload'),0);break;
    case 'reloadFailed':
      assert.match(error,/non confirmee/);
      assert.equal(count('modal'),0);break;
  }
  console.log('OK',mode);
}

(async()=>{
  for(const scenario of ['normal','networkCommitted','networkNotCommitted',
    'simulationRefusee','pending','localEdits','reloadFailed']) {
    await runCase(scenario);
  }
  console.log('7 tests S08 de recuperation atomique reussis (fictifs, sans ecriture serveur).');
})().catch(err=>{console.error(err);process.exitCode=1;});
