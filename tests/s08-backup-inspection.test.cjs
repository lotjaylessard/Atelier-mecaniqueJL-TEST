'use strict';
// Run: node --test tests/s08-backup-inspection.test.cjs
// Offline synthetic fixtures only. No Supabase access, no real restoration.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('function inspectGarageBackup(json){');
const end = html.indexOf('/* Prévalidation supplémentaire', start);
assert.ok(start >= 0 && end > start, 'Backup inspector source was not found');
const source = html.slice(start, end);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const inspect = new Function('garageSnapshotsEquivalent',
  source + ';return inspectGarageBackup;')(same);
const copy = x => JSON.parse(JSON.stringify(x));

function fixture(){
  return {
    format:'atelier-test-full-data-v2',garageId:'g1',userId:'u1',
    cloudVersion:8,createdAt:'2026-11-13T20:00:00Z',
    data:{
      clients:[{id:'c1',vehicles:[{id:'v1',km:12345}]}],
      invoices:[{number:'FA-001',workOrderNumber:'BT-001',status:'paid',
        total:100,paidAmount:100,payments:[{amount:100}]}],
      workorders:[{number:'BT-001',attachments:[
        {name:'doc',path:'u1/g1/file.pdf',type:'application/pdf'}]}],
      notes:[{id:'n1',body:'Important'}],
      links:[{id:'l1',url:'https://example.org'}],
      parts:[{id:'p1'}],services:[{id:'s1'}],
      settings:{gst:5,qst:9.975},invoiceCounter:2
    },
    quotes:[{id:'q1',garage_id:'g1',user_id:'u1',
      quote_number:'SO-001',status:'sent',content:{},version:0}],
    attachments:{bucket:'wo-files',bytesIncluded:false,files:[
      {workorder:'BT-001',name:'doc',path:'u1/g1/file.pdf',type:'application/pdf'}]}
  };
}

test('complete fictional backup passes non-destructive inspection',()=>{
  const result=inspect(fixture());
  assert.equal(result.valid,true,result.issues.join('; '));
  assert.deepEqual(result.warnings,[]);
  for(const key of ['clients','invoices','workorders','notes','links','parts','services'])
    assert.match(result.summary,new RegExp(key+': 1'));
  assert.match(result.summary,/soumissions : 1/);
});
test('missing notes are rejected, not silently omitted',()=>{
  const b=fixture();delete b.data.notes;
  const result=inspect(b);
  assert.equal(result.valid,false);
  assert.ok(result.issues.some(s=>s.includes('notes')));
});
test('duplicate invoice number is rejected',()=>{
  const b=fixture();b.data.invoices.push(copy(b.data.invoices[0]));
  assert.equal(inspect(b).valid,false);
});
test('duplicate quote number is rejected even for separate IDs',()=>{
  const b=fixture();b.quotes.push({...b.quotes[0],id:'q2'});
  assert.equal(inspect(b).valid,false);
});
test('missing Storage path is rejected',()=>{
  const b=fixture();b.data.workorders[0].attachments[0].path='';
  b.attachments.files[0].path='';
  const result=inspect(b);
  assert.equal(result.valid,false);
  assert.ok(result.issues.some(s=>s.includes('Storage')));
});
test('attachment manifest differs from BT references is rejected',()=>{
  const b=fixture();b.attachments.files[0].name='wrong';
  assert.equal(inspect(b).valid,false);
});
test('incoherent paid invoice triggers warning without modifying record',()=>{
  const b=fixture();b.data.invoices[0].paidAmount=80;
  const before=copy(b);
  const result=inspect(b);
  assert.equal(result.valid,true);
  assert.ok(result.warnings.some(s=>s.includes('paiement')));
  assert.deepEqual(b,before);
});
