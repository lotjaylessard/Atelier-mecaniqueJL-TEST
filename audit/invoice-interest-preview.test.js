/* Run: node audit/invoice-interest-preview.test.js */
const assert=require("node:assert/strict");
require("./invoice-interest-preview.js");
const calc=globalThis.JLInvoiceInterestPreview.calculate;
const inv={date:"2026-01-01",total:1000,paidAmount:0,status:"unpaid",payments:[],interestTerms:{enabled:true,accepted:true,acceptedDate:"2025-12-31",annualRate:18,graceDays:30}};
const at=(d,changes={})=>calc({...inv,...changes},d);
assert.equal(at("2026-01-31").interestCents,0);
assert.equal(at("2026-02-01").interestCents,49);
assert.equal(at("2026-03-02").interestCents,1479);
assert.equal(at("2026-03-02",{paidAmount:600,payments:[{date:"2026-01-15",amount:600}]}).interestCents,592);
assert.equal(at("2026-03-02",{paidAmount:600,payments:[{date:"2026-02-15",amount:600}]}).interestCents,1036);
assert.equal(at("2026-03-02",{interestTerms:undefined}).eligible,false);
assert.equal(at("2026-03-02",{interestTerms:{...inv.interestTerms,waived:true}}).eligible,false);
assert.equal(at("2026-03-02",{paidAmount:600}).eligible,false);
assert.equal(at("2026-03-02",{status:"paid",paidDate:"2026-02-15",paidAmount:1000,payments:[{date:"2026-02-15",amount:1000}]}).interestCents,740);
console.log("9 interest preview assertions passed");
