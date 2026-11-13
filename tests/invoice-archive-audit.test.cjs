'use strict';
// node --test tests/invoice-archive-audit.test.cjs
// Simule la concurrence : aucune écriture réelle dans Supabase.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const html=readFileSync(join(__dirname,'..','index.html'),'utf8');
const a=html.indexOf('async function archiveInvoice(number){');
const b=html.indexOf('function invoicePaymentMethodLabel(method)',a);
assert.ok(a>=0&&b>a,'archiveInvoice introuvable');
const code=html.slice(a,b);
const copy=x=>JSON.parse(JSON.stringify(x));
const equivalent=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const initial={invoices:[{number:'F-100',status:'paid',total:50,paidAmount:50,
  payments:[{amount:50,method:'cash'}],archived:false}]};

function scenario(overrides={}){
  let local=copy(initial),remote=copy(initial);
  let alerts=[],writes=0,hydrations=0,recoveries=0,updated=null;
  let revision=0,cloudVersion=4;
  let ready=true,busy=false,dirty=false,pending=false;
  if(overrides.local)overrides.local(local);
  if(overrides.remote)overrides.remote(remote);
  const baseline=copy(local);
  const anomaly=inv=>inv.paidAmount!==inv.total?'Paiement différent du total':null;
  const sb={from:()=>({
    select:()=>({eq:()=>({maybeSingle:async()=>{
      if(overrides.concurrentLocal)local.notes=[{id:'concurrent'}];
      return{data:{data:copy(remote),version:overrides.stale?5:4},error:null};
    }})}),
    update:body=>({eq:()=>({eq:()=>({select:async()=>{
      writes++;
      updated=copy(body);
      if(overrides.writeRejected)return{data:[],error:null};
      return{data:[{garage_id:'g',version:5}],error:null};
    }})})})
  })};
  const vars={
    SUPABASE_USER:{id:'u'},ACTIVE_GARAGE_ID:'g',
    CLOUD_DATA_READY:ready,CLOUD_SYNC_FAILED:false,
    CLOUD_SYNC_IN_PROGRESS:busy,CLOUD_SYNC_DIRTY:dirty,
    CLOUD_SYNC_PENDING:pending,cloudSyncTimer:null,
    CLOUD_LAST_CONFIRMED_SNAPSHOT:baseline,
    CLOUD_CHANGE_REVISION:revision,CLOUD_DATA_VERSION:cloudVersion,
    captureLocalGarageSnapshot:()=>copy(local),
    garageSnapshotsEquivalent:equivalent,
    invoicePaymentMismatch:anomaly,
    confirm:()=>overrides.confirm!==false,
    alert:msg=>alerts.push(msg),
    sb,structuredClone:copy,
    preserveFailedCloudSnapshot:()=>recoveries++,
    clearTimeout:()=>{},
    hydrateLocalFromCloud:data=>{local=copy(data);hydrations++},
    renderInvoiceList:()=>{},renderWorkOrders:()=>{},
    renderHistoryTable:()=>{},renderDashboard:()=>{},
    console:{error:()=>{}}
  };
  if(overrides.unsynced)vars.CLOUD_SYNC_DIRTY=true;
  const names=Object.keys(vars);
  const archive=new Function(...names,code+';return archiveInvoice;')(...Object.values(vars));
  const invoke=async()=>archive('F-100');
  return{invoke,record:()=>({alerts,writes,hydrations,recoveries,local:copy(local),updated})};
}

test('archive seulement une facture payée et confirmée',async()=>{
  const s=scenario();
  assert.equal(await s.invoke(),true);
  assert.equal(s.record().writes,1);
  assert.equal(s.record().hydrations,1);
  assert.equal(s.record().local.invoices[0].archived,true);
});
test('ne modifie rien si des changements locaux sont en attente',async()=>{
  const s=scenario({unsynced:true});
  assert.equal(await s.invoke(),false);
  assert.equal(s.record().writes,0);
});
test('refuse une facture payée avec montant incohérent',async()=>{
  const s=scenario({local:d=>d.invoices[0].paidAmount=45});
  assert.equal(await s.invoke(),false);
  assert.equal(s.record().writes,0);
});
test('refuse une version distante différente',async()=>{
  const s=scenario({stale:true});
  assert.equal(await s.invoke(),false);
  assert.equal(s.record().writes,0);
  assert.equal(s.record().hydrations,0);
});
test('refuse une facture différente dans le cloud',async()=>{
  const s=scenario({remote:d=>d.invoices[0].total=60});
  assert.equal(await s.invoke(),false);
  assert.equal(s.record().writes,0);
});
test('refuse une modification locale concurrente',async()=>{
  const s=scenario({concurrentLocal:true});
  assert.equal(await s.invoke(),false);
  assert.equal(s.record().writes,0);
});
test('refuse un retour Supabase sans confirmation CAS',async()=>{
  const s=scenario({writeRejected:true});
  assert.equal(await s.invoke(),false);
  assert.equal(s.record().hydrations,0);
});
test('respecte une annulation de confirmation',async()=>{
  const s=scenario({confirm:false});
  assert.equal(await s.invoke(),false);
  assert.equal(s.record().writes,0);
});

test('refuse les numéros de facture dupliqués dans les données locales',async()=>{
  const s=scenario({local:d=>d.invoices.push(copy(d.invoices[0]))});
  assert.equal(await s.invoke(),false);
  assert.equal(s.record().writes,0);
  assert.equal(s.record().hydrations,0);
});
test('refuse les numéros de facture dupliqués dans le cloud',async()=>{
  const s=scenario({remote:d=>d.invoices.push(copy(d.invoices[0]))});
  assert.equal(await s.invoke(),false);
  assert.equal(s.record().writes,0);
  assert.equal(s.record().hydrations,0);
});
