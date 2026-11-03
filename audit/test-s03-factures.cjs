// Scenarios mockes S03-F01 - aucune connexion a Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html','utf8');
const start = html.indexOf('function invoicePaymentMethodLabel(method)');
const end = html.indexOf('\n\n  if ($("vehicleSearch"))',start);
assert.ok(start > 0 && end > start,'Fonctions paiements S03-F01 absentes');
const code = html.slice(start,end);
function run(inv, answers) {
  let record = structuredClone(inv);
  let saved = 0;
  let alerts = [];
  let prompts = [...answers];
  const ctx = {
    INVOICES:[record],
    loadInvoices(){},saveInvoices(){ saved++; },
    renderInvoiceList(){},openInvoiceEditModal(){},
    money(n){return n.toFixed(2)},
    prompt(){return prompts.shift()},
    alert(s){alerts.push(s)}
  };
  vm.createContext(ctx);
  vm.runInContext(code,ctx);
  ctx.markInvoicePartial(record.number);
  return {inv:record,saved,alerts,label:m=>ctx.invoicePaymentMethodLabel(m)};
}
for (const [selection,method,label] of [
  ['1','cash','Comptant'],['2','transfer','Virement'],
  ['3','card','Carte'],['4','unspecified','Non spécifié'],['5','other','Autre']
]) {
  const r=run({number:'F1',total:100,paidAmount:0,status:'unpaid',payments:[]},['30.25',selection]);
  assert.equal(r.saved,1);
  assert.equal(r.inv.paidAmount,30.25);
  assert.equal(r.inv.status,'partial');
  assert.equal(r.inv.payments[0].method,method);
  assert.equal(r.label(method),label);
}
{
  const r=run({number:'F2',total:100,paidAmount:40,status:'partial',payments:[{date:'a',amount:40}]},['60','3']);
  assert.equal(r.saved,1);assert.equal(r.inv.paidAmount,100);
  assert.equal(r.inv.status,'paid');assert.equal(r.inv.payments.length,2);
  assert.equal(r.inv.payments[1].method,'card');
}
for (const responses of [[null],['30',null],['30','0'],['1000','1'],['-2','1'],['10.123','1']]) {
 const r=run({number:'F3',total:100,paidAmount:0,status:'unpaid',payments:[]},responses);
 assert.equal(r.saved,0);
 assert.equal(r.inv.payments.length,0);
}
{
 const r=run({number:'F4',total:100,paidAmount:40,status:'partial',payments:[]},['10','1']);
 assert.equal(r.saved,0);assert.ok(r.alerts.some(s=>s.includes('ne concordent')));
}
{
 const r=run({number:'F5',total:100,paidAmount:50,status:'partial',payments:[{amount:40}]},['10','1']);
 assert.equal(r.saved,0);assert.ok(r.alerts.some(s=>s.includes('ne concordent')));
}
console.log('S03-F01 : scénarios de paiement partiel réussis (mockés).');
