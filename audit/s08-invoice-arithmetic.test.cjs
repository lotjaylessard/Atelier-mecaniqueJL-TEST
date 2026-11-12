const assert = require('node:assert/strict');
const cents = x => Math.round((x + Number.EPSILON) * 100) / 100;
function totals(items,{gst=5,qst=9.975,discount=0,discountType='amount',applyGST=true,applyQST=true}={}) {
 const base=items.reduce((sum,x)=>sum+(x.timerSessionId&&Number.isFinite(x.confirmedMs)&&Number.isFinite(x.total)?x.total:x.qty*x.rate),0);
 const reduction=Math.min(discountType==='percent'?base*discount/100:discount,base);const taxable=base-reduction;
 return {subTotal:cents(base),discount:cents(reduction),taxableSubTotal:cents(taxable),gst:cents(applyGST?taxable*gst/100:0),qst:cents(applyQST?taxable*qst/100:0),total:cents(cents(taxable)+cents(applyGST?taxable*gst/100:0)+cents(applyQST?taxable*qst/100:0))};
}
const cases=[
 ['taux QC',[{qty:1,rate:100}],{}, {subTotal:100,gst:5,qst:9.98,total:114.98}],
 ['rabais de 10 %',[{qty:1,rate:100}],{discount:10,discountType:'percent'},{taxableSubTotal:90,gst:4.5,qst:8.98,total:103.48}],
 ['TPS seulement',[{qty:2,rate:40}],{applyQST:false},{gst:4,qst:0,total:84}],
 ['sans taxes',[{qty:2,rate:40}],{applyGST:false,applyQST:false},{total:80}],
 ['minuteur exact',[{qty:0.33,rate:90,timerSessionId:'t',confirmedMs:1200000,total:30}],{},{subTotal:30,total:34.49}],
 ['rabais plafonné',[{qty:1,rate:20}],{discount:100},{discount:20,total:0}],
];
for(const [name,items,options,expected] of cases){const actual=totals(items,options);for(const [key,value]of Object.entries(expected))assert.equal(actual[key],value,name+' / '+key);console.log('OK',name,actual.total);}
console.log('6 scénarios arithmétiques TEST réussis ; tests serveur/concurrence encore requis.');
