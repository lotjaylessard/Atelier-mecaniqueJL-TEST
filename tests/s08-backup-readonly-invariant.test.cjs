'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const html=readFileSync(join(__dirname,'..','index.html'),'utf8');
function between(from,to){
  const start=html.indexOf(from);
  const end=html.indexOf(to,start);
  assert.ok(start>=0 && end>start, 'expected source anchors absent');
  return html.slice(start,end);
}
test('the garage JSON export includes all core collections',()=>{
  const section=between('async function exportAllData(){','function inspectGarageBackup(json){');
  for(const field of ['clients','invoices','workorders','notes','links','parts','services'])
    assert.ok(section.includes('"'+field+'"'),field+' omitted');
  assert.match(section,/data:cloud\.data,quotes/);
  assert.match(section,/cloudVersion:version/);
  assert.match(section,/garageBackupDigest\(payload\)/);
});
test('the backup explicitly declares that physical bytes are excluded',()=>{
  const section=between('async function exportAllData(){','function inspectGarageBackup(json){');
  assert.match(section,/bytesIncluded:false/);
  assert.match(section,/fichiers NON inclus/i);
});
test('import workflow remains inspection-only and refuses automatic restoration',()=>{
  const section=between('async function importAllData(json){','\$("btnExportData")');
  assert.ok(section.includes('inspectGarageBackupCloud(json)'));
  assert.ok(section.includes('La restauration reste désactivée.'));
  for(const forbidden of [/\.update\s*\(/,/\.insert\s*\(/,/\.upsert\s*\(/,/\.delete\s*\(/,/\.rpc\s*\(/])
    assert.doesNotMatch(section,forbidden,
      'Backup import must not silently acquire database write operations');
});
test('cloud verification scans paid and archived invoice differences',()=>{
  const section=between('async function inspectGarageBackupCloud(json){','async function importAllData(json){');
  assert.match(section,/missingProtected/);
  assert.match(section,/changedPaid/);
  assert.match(section,/garage_quotes/);
  assert.match(section,/version/);
});
