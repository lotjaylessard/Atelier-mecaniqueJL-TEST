"use strict";
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const src=fs.readFileSync("audit/s06-live-test.js","utf8");
new vm.Script(src,{filename:"s06-live-test.js"});
assert.equal((html.match(/<script src="audit\/s06-live-test\.js" defer><\/script>/g)||[]).length,1);
assert.match(src,/get\("s06_timer_test"\)!=="1"\) return/,"OFF by default");
assert.match(src,/auth\.getUser\(\)/);
assert.match(src,/\.from\("garage_members"\)/);
assert.match(src,/\.from\("garage_data"\)/);
assert.match(src,/\.from\("garage_timer_sessions"\)/);
assert.match(src,/\.rpc\("s06_timer_transition"/);
assert.match(src,/p_expected_revision:Number\(current\.revision\)/);
assert.match(src,/p_action:"create",p_expected_revision:0/);
assert.match(src,/confirmed_ms/);
assert.match(src,/setInterval\(/);
assert.match(src,/10000/);
assert.match(src,/button\("recover"/);
assert.match(src,/confirm\("Créer une session/);
assert.match(src,/!snap\.invoices\.some/);
assert.match(src,/if\(!navigator\.onLine\)/);
for(const forbidden of [/\.insert\(/,/\.update\(/,/\.delete\(/,/\.upsert\(/,/localStorage/,/sessionStorage/,/\.setItem\(/,/WO_TIMER_INTERVAL\s*=/,/startWOTimer\(/,/stopWOTimer\(/,/\.labor\.push\(/,/saveWorkOrders\(/,/persistActiveWO\(/,/s06_timer_post_labor/])
 assert.doesNotMatch(src,forbidden,"No legacy BT or invoice mutation");
const context={
  location:{search:""},URLSearchParams,window:{},document:new Proxy({}, {get(){throw Error("The module must not access DOM when not enabled");}}),
};
vm.runInNewContext(src,context);
console.log("S06-F03b : opt-in OFF, syntaxe valide, actions RPC explicites et BT historique inchange.");
