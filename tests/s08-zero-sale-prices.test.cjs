'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function functionSource(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a);
 assert.ok(a>=0 && b>a, 'Source function not found: '+start);
 return html.slice(a,b);
}
function addServiceFixture(service){
 const source=functionSource('function addServiceToCurrentWO(serviceId){','function addPartToCurrentWO(partIndex){');
 const wo={labor:[]};
 const alerts=[];
 const handler=new Function('$','getActiveWOById','SERVICES','persistActiveWO','woRenderLines','alert',
 source+';return addServiceToCurrentWO;')(
  id=>id==='woEditId'?{value:'w1'}:null,
  ()=>wo,[{id:10,name:'Service fictif',...service}],
  ()=>{},()=>{},msg=>alerts.push(msg)
 );
 handler(10);
 return {wo,alerts};
}
test('free hourly service is accepted on BT with positive hours and zero rate',()=>{
 const {wo,alerts}=addServiceFixture({hours:2,rate:0,priceFixed:0});
 assert.equal(wo.labor.length,1);
 assert.equal(wo.labor[0].hours,2);
 assert.equal(wo.labor[0].rate,0);
 assert.equal(wo.labor[0].total,0);
 assert.ok(!alerts.some(s=>s.includes('mal configuré')));
});
test('free fixed-price service is accepted on BT',()=>{
 const {wo}=addServiceFixture({hours:0,rate:0,priceFixed:0});
 assert.equal(wo.labor.length,1);
 assert.equal(wo.labor[0].hours,1);
 assert.equal(wo.labor[0].rate,0);
});
test('paid fixed-price service stays fixed when hours are filled too',()=>{
 const {wo}=addServiceFixture({hours:2,rate:90,priceFixed:150});
 assert.equal(wo.labor[0].hours,1);
 assert.equal(wo.labor[0].rate,150);
});
test('negative catalog service never posts a labor line',()=>{
 const {wo,alerts}=addServiceFixture({hours:2,rate:-5,priceFixed:-2});
 assert.equal(wo.labor.length,0);
 assert.ok(alerts.some(s=>s.includes('mal configuré')));
});
function invoiceService(service){
 const source=functionSource('function addServiceToInvoice(s){','function renderServices(){');
 const items=[];
 const handler=new Function('items','renderItems',source+';return addServiceToInvoice;')(items,()=>{});
 handler({name:'Fictif',desc:'',...service});
 return items[0];
}
test('invoice correctly uses free hourly and free fixed-price service',()=>{
 const hourly=invoiceService({priceFixed:0,hours:3,rate:0});
 const fixed=invoiceService({priceFixed:0,hours:0,rate:0});
 assert.equal(hourly.qty,3);
 assert.equal(hourly.rate,0);
 assert.equal(fixed.qty,1);
 assert.equal(fixed.rate,0);
});
test('manual WO part and labor require positive quantity but accept zero sale rate',()=>{
 assert.match(html,/!name \|\| !Number\.isFinite\(qty\) \|\| qty <= 0 \|\| !Number\.isFinite\(rate\) \|\| rate < 0/);
 assert.match(html,/!desc \|\| !Number\.isFinite\(hours\) \|\| hours <= 0 \|\| !Number\.isFinite\(rate\) \|\| rate < 0/);
});
test('manual invoice labor accepts zero and rejects negative',()=>{
 assert.match(html,/!desc \|\| !Number\.isFinite\(hours\) \|\| hours<=0 \|\| !Number\.isFinite\(rate\) \|\| rate<0/);
});
test('quote line sale price still accepts zero and rejects negative',()=>{
 assert.match(html,/price<0\|\|!Number\.isSafeInteger\(priceCents\)/);
});
