'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function fragment(from,to){
 const start=html.indexOf(from);
 assert.ok(start>=0,'Missing '+from);
 const end=html.indexOf(to,start+from.length);
 assert.ok(end>start,'Missing end '+to);
 return html.slice(start,end);
}
test('historique des soumissions: lecture limitée au compte et garage',()=>{
 const src=fragment('async function jlHistoryLoadQuotes()','/* S10 TEST — palette utilisateur');
 assert.match(src,/from\("garage_quotes"\)/);
 assert.match(src,/eq\("garage_id",ACTIVE_GARAGE_ID\)/);
 assert.match(src,/eq\("user_id",auth\.user\.id\)/);
 assert.doesNotMatch(src,/\.insert\(|\.update\(|\.delete\(/);
 assert.match(html,/id="historyQuoteTable"/);
});
test('historique: navigation possible vers une soumission ancienne',()=>{
 assert.match(html,/jl-dashboard-open-quote/);
 assert.match(html,/L'historique contient davantage de soumissions/);
 assert.match(html,/\.eq\("id",requested\)\.eq\("garage_id",garageId\)\.eq\("user_id",auth\.user\.id\)/);
});
test('palette couleur: préservation des catégories et configuration locale',()=>{
 for(const key of ['work','note','workshop','private'])
  assert.match(html,new RegExp('data-jl-palette="'+key+'"'));
 assert.match(html,/jl-calendar-palette:/);
 assert.match(html,/localStorage\.setItem\(jlPaletteOwner/);
 assert.match(html,/color-mix\(in srgb,var\(--jl-color-/);
});
test('soumissions envoyées: délai configurable et garde de version',()=>{
 assert.match(html,/id="settingQuoteValidityDays"/);
 assert.match(html,/quoteValidityDays: 15/);
 assert.match(html,/content:to==="sent"\?\{\.\.\.\(q\.content\|\|\{\}\),sentAt:/);
 const src=fragment('async function expireDueSentQuotes(','async function refreshQuotes(){');
 assert.match(src,/status==="sent"/);
 assert.match(src,/!q\.content\?\.approvalConfirmedAt/);
 assert.match(src,/typeof q\.content\?\.sentAt==="string"/);
 assert.match(src,/\.eq\("status","sent"\)\.eq\("version",q\.version\)/);
 assert.match(src,/\.eq\("user_id",userId\)/);
 assert.match(html,/id="s08QuoteValidityNotice"/);
});
