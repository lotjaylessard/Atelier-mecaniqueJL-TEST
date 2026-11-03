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


// S03-F02 : regles des paiements complets (aucun acces au reseau/Supabase).
const fullStart = html.indexOf('function payInvoiceWithMethod(number, method){');
const fullEnd = html.indexOf('/* ===================== WORK ORDERS', fullStart);
assert.ok(fullStart > 0 && fullEnd > fullStart, 'Fonction paiement complet introuvable');
const fullCode = html.slice(fullStart, fullEnd);
const markStart = html.indexOf('function markInvoicePaid(number){');
const markEnd = html.indexOf('function archiveInvoice(number){', markStart);
assert.ok(markStart > 0 && markEnd > markStart, 'Fonction marquer payee introuvable');
const markCode = html.slice(markStart, markEnd);
function runFull(initial, method, useLegacy = false){
  const inv = structuredClone(initial);
  let saved=0, rendered=0, opened=0;
  const alerts=[];
  const ctx={
    INVOICES:[inv],loadInvoices(){}, saveInvoices(){saved++;},
    renderInvoiceList(){rendered++;},openInvoiceEditModal(){opened++;},
    renderDashboard(){},alert(message){alerts.push(message)}
  };
  vm.createContext(ctx);
  vm.runInContext(fullCode + '\\n' + markCode, ctx);
  if (useLegacy) ctx.markInvoicePaid(inv.number);
  else ctx.payInvoiceWithMethod(inv.number, method);
  return { inv, saved, rendered, opened, alerts };
}
for (const method of ['cash','transfer','card','unspecified','other']){
  const result = runFull({number:'FULL',total:100,paidAmount:25,status:'partial',
    payments:[{date:'old',amount:25,method:'cash'}]},method);
  assert.equal(result.saved,1);
  assert.equal(result.inv.status,'paid');
  assert.equal(result.inv.paidAmount,100);
  assert.equal(result.inv.payments.length,2);
  assert.equal(result.inv.payments[1].amount,75);
  assert.equal(result.inv.payments[1].method,method);
}
{
  const result=runFull({number:'LEGACY',total:100,paidAmount:20,status:'partial',
    payments:[{date:'old',amount:20}]},null,true);
  assert.equal(result.saved,1);
  assert.equal(result.inv.payments.length,2);
  assert.equal(result.inv.payments[1].method,'unspecified');
}
for (const [invoice,method] of [
  [{number:'A',total:100,paidAmount:100,status:'paid',payments:[{amount:100}]},'cash'],
  [{number:'B',total:100,paidAmount:0,status:'unpaid',archived:true,payments:[]},'cash'],
  [{number:'C',total:100,paidAmount:20,status:'partial',payments:[]},'cash'],
  [{number:'D',total:100,paidAmount:40,status:'partial',payments:[{amount:30}]},'cash'],
  [{number:'E',total:100,paidAmount:0,status:'unpaid',payments:[]},'invalid'],
  [{number:'F',total:0,paidAmount:0,status:'unpaid',payments:[]},'cash'],
  [{number:'G',total:100,paidAmount:120,status:'partial',payments:[{amount:120}]},'cash'],
  [{number:'H',total:100,paidAmount:0,status:'unpaid',payments:[{amount:'x'}]},'cash']
]){
  const before=JSON.stringify(invoice);
  const result=runFull(invoice,method);
  assert.equal(result.saved,0,'Aucun enregistrement attendu pour '+invoice.number);
  assert.equal(JSON.stringify(result.inv),before,'Aucune mutation attendue pour '+invoice.number);
}
console.log('S03-F02 : paiements complets, protections et historique reussis (mockes).');
