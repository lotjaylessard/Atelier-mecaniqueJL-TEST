'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function functionSource(name){
 const start=html.indexOf('function '+name+'(');
 assert.ok(start>=0,'Missing '+name);
 // These two functions are pure and terminate before a blank line.
 const end=html.indexOf('\n}\n\n',start);
 assert.ok(end>start,'Missing function end');
 return html.slice(start,end+2);
}
test('S10 preserves supplier and prices from WO to invoice items',()=>{
 const map=new Function(functionSource('woInvoiceItemsFromWO')+'\nreturn woInvoiceItemsFromWO;')();
 const rows=map({parts:[{name:'Filtre',number:'AA-18',supplier:'NAPA',qty:2,rate:21.5}],
   labor:[{description:'Pose',hours:1,rate:90}]});
 assert.equal(rows[0].supplier,'NAPA');
 assert.equal(rows[0].total,43);
 assert.equal(rows[1].supplier,undefined);
 assert.equal(rows[1].total,90);
});
test('S10 preserves supplier when reopening invoice as temporary work order',()=>{
 const toWO=new Function(functionSource('invoiceToTempWO')+'\nreturn invoiceToTempWO;')();
 const invoice={number:'FA-TEST',customer:'Client',vehicle:'Auto',date:'2026-11-19',
  items:[{type:'Pièce',desc:'Filtre',number:'AA-18',supplier:'NAPA',qty:2,rate:21.5},
    {type:"Main-d'œuvre",desc:'Pose',qty:1,rate:90}]};
 const wo=toWO(invoice);
 assert.equal(wo.parts[0].supplier,'NAPA');
 assert.equal(wo.parts[0].total,43);
 assert.equal(wo.labor[0].total,90);
});
