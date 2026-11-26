/* Interest preview engine: pure calculation, no storage or payment mutation.
   Explicit accepted terms only. Payments allocated to principal first for this
   draft; final payment integration must use the same rule. */
(function(root){
"use strict";
const day = value => {
  const m=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if(!m)return NaN;
  const y=+m[1],mo=+m[2],d=+m[3],t=new Date(Date.UTC(y,mo-1,d));
  return t.getUTCFullYear()===y&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d?t.getTime()/86400000:NaN;
};
const cents = value => {const n=Number(value);return Number.isFinite(n)&&n>=0&&Number.isSafeInteger(Math.round(n*100))?Math.round(n*100):NaN;};
function calculate(inv,asOf){
  const terms=inv?.interestTerms;
  const principal=cents(inv?.total),paid=cents(inv?.paidAmount??0);
  const fail=reason=>({eligible:false,reason,interestCents:0});
  if(!terms||terms.enabled!==true||terms.accepted!==true||terms.waived===true)return fail("no-agreed-terms");
  const rate=Number(terms.annualRate),grace=Number(terms.graceDays);
  const issued=day(inv.date),accepted=day(terms.acceptedDate),now=day(asOf);
  if(![principal,paid,issued,accepted,now,rate,grace].every(Number.isFinite)||rate<=0||rate>100||!Number.isInteger(grace)||grace<0||grace>365||accepted>issued||now<issued)return fail("invalid-input");
  const closed=inv.status==="paid"||inv.archived===true;
  const end=closed?day(inv.paidDate):now;
  if(!Number.isFinite(end)||end<issued||end>now)return fail("invalid-settlement");
  const start=issued+grace;
  const payments=Array.isArray(inv.payments)?inv.payments.map(p=>({day:day(p.date),amount:cents(p.amount)})):[];
  if(paid>principal||payments.some(p=>!Number.isFinite(p.day)||!Number.isFinite(p.amount)||p.day<issued||p.day>end)||payments.reduce((s,p)=>s+p.amount,0)!==paid)return fail("payment-history-mismatch");
  payments.sort((a,b)=>a.day-b.day);
  let balance=principal, cursor=start, weighted=0;
  for(const p of payments){
    const until=Math.max(start,p.day);
    weighted+=balance*Math.max(0,until-cursor);
    cursor=Math.max(cursor,until);
    balance=Math.max(0,balance-p.amount);
  }
  weighted+=balance*Math.max(0,end-cursor);
  const interest=Math.round(weighted*rate/36500);
  if(!Number.isSafeInteger(interest))return fail("overflow");
  return {eligible:true,interestCents:interest,principalRemainingCents:balance,daysLate:Math.max(0,end-start),estimatedDueCents:Math.max(0,principal+interest-paid)};
}
/* Pure payment plan. Existing invoice accounting keeps principal payments
   in paidAmount; interest receipts are recorded separately. */
function planPayment(inv,asOf,amountCents){
  const result=calculate(inv,asOf);
  const fail=reason=>({ok:false,reason});
  if(!result.eligible||inv.status==="paid"||inv.archived===true)return fail("not-payable");
  const entries=Array.isArray(inv.interestPayments)?inv.interestPayments:[];
  let interestPaid=0;
  for(const entry of entries){
    const value=cents(entry.amount),date=day(entry.date);
    if(!Number.isSafeInteger(value)||value<=0||!Number.isFinite(date)||date<day(inv.date)||date>day(asOf))return fail("invalid-interest-history");
    interestPaid+=value;
  }
  if(!Number.isSafeInteger(interestPaid)||interestPaid>result.interestCents)return fail("interest-history-mismatch");
  const principalDue=result.principalRemainingCents;
  const interestDue=result.interestCents-interestPaid;
  const due=principalDue+interestDue;
  const amount=amountCents===undefined?due:amountCents;
  if(!Number.isSafeInteger(amount)||amount<=0||amount>due)return fail("invalid-payment");
  const principalPayment=Math.min(principalDue,amount),interestPayment=amount-principalPayment;
  return {ok:true,amountCents:amount,principalPaymentCents:principalPayment,interestPaymentCents:interestPayment,remainingCents:due-amount,fullyPaid:due===amount};
}
function applyPayment(inv,asOf,method,amountCents){
  if(!["cash","transfer","card","unspecified","other"].includes(method))return {ok:false,reason:"invalid-method"};
  const plan=planPayment(inv,asOf,amountCents);
  if(!plan.ok)return plan;
  const next={...inv,payments:[...(inv.payments||[])],interestPayments:[...(inv.interestPayments||[])]};
  if(plan.principalPaymentCents)next.payments.push({date:asOf,amount:plan.principalPaymentCents/100,method});
  if(plan.interestPaymentCents)next.interestPayments.push({date:asOf,amount:plan.interestPaymentCents/100,method});
  next.paidAmount=(cents(inv.paidAmount??0)+plan.principalPaymentCents)/100;
  next.status=plan.fullyPaid?"paid":"partial";
  next.paidDate=plan.fullyPaid?asOf:null;
  if(plan.fullyPaid)next.paymentMethod=method;
  return {...plan,invoice:next};
}
root.JLInvoiceInterestPreview=Object.freeze({calculate,planPayment,applyPayment});
})(typeof globalThis==="object"?globalThis:window);
