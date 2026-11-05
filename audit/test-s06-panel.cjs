"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const source=fs.readFileSync("audit/s06-timer-panel-preview.html","utf8");
const app=fs.readFileSync("index.html","utf8");
const expected=[
  "id=\"timerTrigger\"","id=\"timerPanel\"","id=\"timerMini\"",
  "id=\"timerMiniStatus\"","id=\"timerFull\"","id=\"toggleTimer\"",
  "id=\"finishTimer\"","aria-expanded=\"false\"","aria-live=\"off\"",
  "MAQUETTE S06-F04","Aucun accès Supabase","role=\"region\"",
  "window.addEventListener(\"pagehide\""
];
for(const token of expected)assert.ok(source.includes(token), "Element absent : "+token);
assert.match(source,/<button[^>]+id="finishTimer"[^>]+disabled/);
assert.doesNotMatch(source,/\.(?:from|rpc)\s*\(\s*["']garage_timer_sessions/);
assert.doesNotMatch(source,/localStorage|sessionStorage/);
const inline=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(inline.length,1,"Un seul script local sans dependances");
new vm.Script(inline[0][1]);
assert.ok(!app.includes('id="timerTrigger"'),"Ne pas activer prematurement dans index.html");
console.log("S06-F04 : maquette isolee, controles, clavier, minuteur et absence de persistance : OK.");
