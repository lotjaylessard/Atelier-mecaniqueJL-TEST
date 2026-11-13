'use strict';
// Exécuter depuis le dépôt : node --test tests/backup-audit.test.cjs
// Tests purement locaux, sans accès Supabase ni modification de données.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const html=readFileSync(join(__dirname,'..','index.html'),'utf8');
function extract(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Fonction introuvable : '+start);
  return html.slice(a,b);
}
function canonical(x){
  if(Array.isArray(x))return x.map(canonical);
  if(x&&typeof x==='object')
    return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));
  return x;
}
const equivalent=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const inspect=new Function('garageSnapshotsEquivalent',
  extract('function inspectGarageBackup(json){','async function inspectGarageBackupCloud(json){')+
  ';return inspectGarageBackup;')(equivalent);
const cloudSource=extract('async function inspectGarageBackupCloud(json){','async function importAllData(json){');

const q={id:'q1',garage_id:'g',user_id:'u',quote_number:'SO-1',status:'draft',
  content:{},created_at:'2026-01-01',updated_at:'2026-01-01',version:1,converted_bt_id:null};
const snapshot={clients:[],invoices:[{number:'FA-1',status:'paid',archived:true,
    total:50,paidAmount:50,payments:[{amount:50}],workOrderNumber:'BT-1'}],
  workorders:[{number:'BT-1',attachments:[]}],notes:[],links:[],parts:[],services:[],
  settings:{garageName:'TEST'},invoiceCounter:1};
const backup={format:'atelier-test-full-data-v2',createdAt:'2026-11-12T20:00:00Z',
  garageId:'g',userId:'u',cloudVersion:3,data:snapshot,quotes:[q],
  attachments:{bucket:'wo-files',files:[],bytesIncluded:false}};
const copy=x=>JSON.parse(JSON.stringify(x));
const change=(mutator)=>{const out=copy(backup);mutator(out);return out};
const issue=(b,part)=>inspect(b).issues.some(s=>s.includes(part));
const warning=(b,part)=>inspect(b).warnings.some(s=>s.includes(part));

test('sauvegarde correctement structurée',()=>assert.equal(inspect(backup).valid,true));
test('refuse une section de notes manquante',()=>assert.ok(issue(change(x=>delete x.data.notes),'notes')));
test('refuse un numéro de facture dupliqué',()=>assert.ok(issue(change(x=>x.data.invoices.push(copy(x.data.invoices[0]))),'double')));
test('refuse un numéro de BT absent',()=>assert.ok(issue(change(x=>delete x.data.workorders[0].number),'Identifiant')));
test('refuse une soumission d’un autre garage',()=>assert.ok(issue(change(x=>x.quotes[0].garage_id='autre'),'Soumission')));
test('refuse des numéros de soumission en double',()=>assert.ok(issue(change(x=>x.quotes.push({...copy(q),id:'q2'})),'Numéro de soumission')));
test('refuse des références de pièce jointe incohérentes',()=>assert.ok(issue(change(x=>x.data.workorders[0].attachments.push({name:'a',path:'a'})),'pièces jointes')));
test('avertit sur facture archivée non payée',()=>assert.ok(warning(change(x=>x.data.invoices[0].status='unpaid'),'archivées non payées')));
test('avertit sur un paiement incohérent',()=>assert.ok(warning(change(x=>x.data.invoices[0].paidAmount=51),'incohérence de paiement')));
test('avertit sur une facture reliée à BT inexistant',()=>assert.ok(warning(change(x=>x.data.invoices[0].workOrderNumber='BT-999'),'BT absent')));

function mockChain(terminal){
  return new Proxy({}, {get(_,key){
    if(key==='range')return terminal.range;
    if(key==='maybeSingle')return terminal.maybeSingle;
    return ()=>mockChain(terminal);
  }});
}
async function cloudInspect({quotes1=[q],quotes2=[q],version2=3,remoteData=snapshot,save=backup}={}){
  let quoteReads=0,garageReads=0;
  const sb={auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})},
    from:table=>mockChain(table==='garage_quotes'
      ?{range:async()=>({data:copy(++quoteReads===1?quotes1:quotes2),error:null})}
      :{maybeSingle:async()=>({data:++garageReads===1
        ?{data:copy(remoteData),version:3}:{version:version2},error:null})})};
  const fn=new Function('sb','SUPABASE_USER','ACTIVE_GARAGE_ID',
    'CLOUD_DATA_READY','CLOUD_SYNC_FAILED','CLOUD_SYNC_IN_PROGRESS',
    'CLOUD_SYNC_PENDING','CLOUD_SYNC_DIRTY','cloudSyncTimer',
    'garageSnapshotsEquivalent',cloudSource+';return inspectGarageBackupCloud;')
    (sb,{id:'u'},'g',true,false,false,false,false,null,equivalent);
  return fn(copy(save));
}
test('inspection cloud stable',async()=>assert.deepEqual(await cloudInspect(),[]));
test('refuse une soumission modifiée pendant l’inspection',async()=>{
  await assert.rejects(cloudInspect({quotes2:[{...q,version:2}]}),/Soumissions modifiées/);
});
test('refuse le changement de version de garage pendant l’inspection',async()=>{
  await assert.rejects(cloudInspect({version2:4}),/Version ou session changée/);
});
test('signale une facture payée absente du fichier',async()=>{
  const old=change(x=>{x.data.invoices=[]});
  const warnings=await cloudInspect({save:old});
  assert.ok(warnings.some(w=>w.includes('restauration interdite')));
});
