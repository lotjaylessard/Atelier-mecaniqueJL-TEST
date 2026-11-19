'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function section(a,b){
 const start=html.indexOf(a);assert.ok(start>=0,'Missing '+a);
 const end=html.indexOf(b,start+a.length);assert.ok(end>start,'Missing '+b);
 return html.slice(start,end);
}
test('S10 supplier list is stored in garage settings, not production',()=>{
 assert.match(html,/id="jlSupplierSettings"/);
 assert.match(html,/id="jlSupplierAdd"/);
 assert.match(html,/SETTINGS\.suppliers=clean/);
 assert.match(html,/localStorage\.setItem\(STORAGE\.settings,JSON\.stringify\(SETTINGS\)\)/);
 assert.match(html,/scheduleCloudSync\(\)/);
 assert.match(html,/CLOUD_DATA_READY\|\|!ACTIVE_GARAGE_ID\|\|!SUPABASE_USER\?\.id/);
});
test('S10 quote supplier is optional and preserved in source lines',()=>{
 assert.match(html,/id="s08LineSupplier"/);
 assert.match(html,/supplier:get\("s08LineSupplier"\)\.value\.trim\(\)\.slice\(0,80\)/);
 assert.match(html,/supplier:supplier\.value\.trim\(\)\.slice\(0,80\)/);
 assert.match(html,/lines:lines\.map\(l=>\(\{\.\.\.l\}\)\)/);
 assert.match(html,/class="s08-internal-col">Fournisseur/);
});
test('S10 supplier is editable in BT and included in invoices',()=>{
 assert.match(html,/id="woManualPartSupplier"/);
 assert.match(html,/line\.supplier = String\(\$\("woEditSupplier"\)/);
 assert.match(html,/supplier:controls\[5\]\.value\.trim\(\)\.slice\(0,80\)/);
 for(const scope of [
  ['function woInvoiceItemsFromWO','function woInvoiceMatchesWO'],
  ['function invoiceToTempWO','function openInvoiceAsWO'],
  ['function saveTempWOToInvoice','function renderInvoiceAsWO'],
  ['function woConvertToInvoice','function ']
 ]){
  assert.match(section(...scope),/supplier:/);
 }
});
test('S10 supplier is internal on client printouts',()=>{
 assert.match(html,/copy\.querySelectorAll\("\.s08-internal-col"\)/);
 assert.match(html,/@media print\{\.jl-supplier-internal\{display:none!important\}\}/);
 assert.match(html,/\.pdf-export \.jl-supplier-internal\{display:none!important\}/);
 assert.match(html,/id="jlSupplierShowQuotes"/);
 assert.match(html,/id="jlSupplierShowInvoices"/);
});
test('S10 settings and supplier source scripts parse',()=>{
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!match[2].trim()||/type=["']module["']/.test(match[1]))continue;
  assert.doesNotThrow(()=>new vm.Script(match[2]));
 }
});
