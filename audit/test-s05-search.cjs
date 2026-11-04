const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const html = fs.readFileSync("index.html","utf8");
const begin=html.indexOf("function moduleNormalizeSearch(value){");
const end=html.indexOf("function renderInvoiceList(){",begin);
assert.ok(begin>=0 && end>begin,"S05 : utilitaires communs absents");
const ctx={
 CLIENTS:[
 {id:1,name:"Émile Tremblay",phone:"(418) 555-1234",
 vehicles:[{year:2022,make:"Mazda",model:"Mazda3",vin:"JH4-DA9350-MS",plate:"ABC-123"}]}
 ],
 renderInvoiceList(){ctx.rendered=(ctx.rendered||0)+1;}
};
vm.createContext(ctx);
vm.runInContext(html.slice(begin,end),ctx);
const rows=[
 {number:"FA-9",date:"2026-10-01",customer:"Émile Tremblay",customerId:1,vehicle:"2022 Mazda Mazda3",total:100,status:"unpaid",items:[{desc:"Changement huile"}]},
 {number:"FA-10",date:"2026-11-01",customer:"Zoé Gagnon",total:15,status:"partial",items:[]},
 {number:"FA-2",date:"2026-09-01",customer:"Alice",total:300,status:"paid",items:[]}
];
const fields=ctx.invoiceSearchFields(rows[0]);
for(const term of ["emile","Tremblay","FA9","4185551234","JH4DA9350MS","ABC123","mazda3","huile"]){
 assert.ok(ctx.moduleMatchesSearch(fields,term),"Recherche échouée : "+term);
}
assert.ok(!ctx.moduleMatchesSearch(fields,"non-correspondant"));
assert.ok(ctx.moduleMatchesSearch(fields,""));
assert.deepEqual(Array.from(ctx.moduleSortRows(rows,"number","asc",ctx.invoiceSortValue),x=>x.number),["FA-2","FA-9","FA-10"]);
assert.deepEqual(Array.from(ctx.moduleSortRows(rows,"total","desc",ctx.invoiceSortValue),x=>x.number),["FA-2","FA-9","FA-10"]);
assert.deepEqual(Array.from(ctx.moduleSortRows(rows,"date","desc",ctx.invoiceSortValue),x=>x.number),["FA-10","FA-9","FA-2"]);
ctx.setInvoiceSort("client");
assert.equal(ctx.INVOICE_SORT_KEY,"client");
assert.equal(ctx.INVOICE_SORT_DIRECTION,"asc");
ctx.setInvoiceSort("client");
assert.equal(ctx.INVOICE_SORT_DIRECTION,"desc");
assert.equal(ctx.rendered,2);
for(const key of ["number","date","client","total","status"])
 assert.ok(html.includes('data-module-sort="'+key+'"'),"En-tête manquant : "+key);
assert.ok(html.includes('id="invoiceResultCount"'));
const renderBegin=html.indexOf("function renderInvoiceList(){");
const renderEnd=html.indexOf("function updateInvoiceRow(",renderBegin);
const renderSource=html.slice(renderBegin,renderEnd);
assert.ok(renderSource.includes("moduleMatchesSearch(invoiceSearchFields(inv),search)"));
assert.ok(renderSource.includes("moduleSortRows(filtered,INVOICE_SORT_KEY"));
assert.ok(renderSource.includes('inv.archived !== true'),"Les archives restent exclues");
assert.ok(renderSource.includes('Aucune facture ne correspond'));
assert.ok(html.includes('class="module-search-toolbar"'));
assert.ok(html.includes('class="module-sort-button"'));
console.log("S05-F01 : recherche factures instantanée, design commun et 5 colonnes triables vérifiés.");
