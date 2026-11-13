'use strict';
// node --test tests/backup-integrity.test.cjs
// SHA-256 réel avec Web Crypto de Node; aucune connexion Supabase.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {webcrypto,createHash}=require('node:crypto');
const html=readFileSync(join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('async function garageBackupDigest(payload){');
const end=html.indexOf('async function exportAllData(){',start);
assert.ok(start>=0&&end>start,'garageBackupDigest introuvable');
const source=html.slice(start,end);
const digest=new Function('crypto','TextEncoder',source+';return garageBackupDigest;')(webcrypto,TextEncoder);
const base={
  format:'atelier-test-full-data-v2',garageId:'g',userId:'u',cloudVersion:4,
  data:{clients:[{name:'Émile'}],invoices:[],workorders:[],notes:[{text:'Québec ☃️'}],
    links:[],parts:[],services:[],settings:{},invoiceCounter:1},
  quotes:[],attachments:{bucket:'wo-files',files:[],bytesIncluded:false}
};
const copy=v=>JSON.parse(JSON.stringify(v));
test('empreinte identique au vrai SHA-256 de Node',async()=>{
  const expected=createHash('sha256').update(JSON.stringify(base),'utf8').digest('hex');
  assert.equal(await digest(base),expected);
});
test('SHA-256 déterministe et format 64 hex',async()=>{
  const a=await digest(base),b=await digest(copy(base));
  assert.equal(a,b);
  assert.match(a,/^[0-9a-f]{64}$/);
});
test('une note modifiée change l’empreinte',async()=>{
  const other=copy(base);other.data.notes[0].text='autre note';
  assert.notEqual(await digest(base),await digest(other));
});
test('une pièce jointe ajoutée change l’empreinte',async()=>{
  const other=copy(base);other.attachments.files.push({path:'a.pdf'});
  assert.notEqual(await digest(base),await digest(other));
});
test('une soumission ajoutée change l’empreinte',async()=>{
  const other=copy(base);other.quotes.push({id:'q1'});
  assert.notEqual(await digest(base),await digest(other));
});
test('le champ integrity n’entre pas dans le calcul',async()=>{
  const other=copy(base);other.integrity={algorithm:'SHA-256',digest:'0'.repeat(64)};
  assert.equal(await digest(base),await digest(other));
});
test('ne modifie pas le fichier d’entrée',async()=>{
  const payload=copy(base);
  await digest(payload);
  assert.deepEqual(payload,base);
});
test('échoue sans Web Crypto au lieu de prétendre vérifier',async()=>{
  const unavailable=new Function('crypto','TextEncoder',source+
    ';return garageBackupDigest;')({subtle:null},TextEncoder);
  await assert.rejects(unavailable(base),/intégrité indisponible/);
});
