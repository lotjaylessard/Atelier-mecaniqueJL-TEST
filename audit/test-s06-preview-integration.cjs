"use strict";
// S06-F04e : affichage conditionnel et observation EN LECTURE SEULE du timer existant.
const fs=require("node:fs");
const assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const once=(regex,label)=>assert.equal((html.match(regex)||[]).length,1,label);
once(/id="s06SidebarTimer"/g,"panneau unique");
assert.doesNotMatch(html,/id="s06PreviewToggle"/,"aucun declencheur flottant");
assert.doesNotMatch(html,/id="s06PreviewPanel"/,"aucune popup");
const menu=html.indexOf("<h2>Menu</h2>");
const panel=html.indexOf('<section id="s06SidebarTimer"');
const dashboard=html.indexOf('<button class="navBtn" data-page="page-dashboard"');
assert.ok(menu>=0&&panel>menu&&dashboard>panel,"panneau sous Menu avant Dashboard");
const widget=html.slice(panel,html.indexOf("</section>",panel));
assert.match(widget,/<section[^>]*hidden>/,"cache par defaut");
assert.match(html,/#s06SidebarTimer\[hidden\]\{display:none!important\}/,"masquage CSS");
assert.match(widget,/# BT :/);
assert.match(widget,/Véhicule :/);
assert.match(widget,/Description :/);
assert.doesNotMatch(widget,/Client :/);
assert.match(widget,/id="s06TimerWorkOrder"/);
assert.match(widget,/id="s06TimerTime"/);
assert.doesNotMatch(widget,/<button[^>]*>▶ Démarrer/,"ne pas controler la minuterie depuis le miroir");
const start=html.indexOf("<!-- S06-F04e : miroir visuel");
const end=html.indexOf("<!-- MODAL D'ÉDITION DE LIGNE -->",start);
assert.ok(start>=0&&end>start,"miroir observateur independant du code BT");
const script=html.slice(start,end);
for(const pattern of [
 /#woTimerBtn,#woTimerPauseBtn,#woTimerStopBtn/,
 /document\.getElementById\("woEditId"\)/,
 /typeof WO_TIMER_INTERVAL/,
 /typeof WO_TIMER_PAUSED/,
 /typeof WO_TIMER!=="undefined"/,
 /state\(\)/,
 /box\.hidden=true/,
 /activeId=null;activeMetadata=null;box\.hidden=true/,
 /if\(!wo\|\|wo\.status!=="en_cours"\)return null/,
 /document\.getElementById\("s06TimerDescription"\)/,
 /number\.addEventListener\("click"/,
 /openWorkOrderFromDashboard\(activeId\)/,
 /setInterval\(refresh,500\)/
])assert.match(script,pattern);
for(const forbidden of [/localStorage/,/sessionStorage/,/garageSupabase/,/\.rpc\(/,/\.from\(/,/fetch\(/,/wo\.labor\.push/,/persistActiveWO\(/,/saveWorkOrders\(/,/startWOTimer\(/,/stopWOTimer\(/,/pauseWOTimer\(/])
 assert.doesNotMatch(script,forbidden,"observateur sans mutation");
assert.match(html,/id="cloudSyncIndicator"/,"indicateur sync preserve");
assert.match(html,/id="woTimerBtn"/,"ancien timer preserve");
assert.match(html,/#s06SidebarTimer\[data-status="running"\]/);
assert.match(html,/#s06SidebarTimer\[data-status="paused"\]/);
assert.match(html,/#s06SidebarTimer \.s06-timer-description\{[^}]*-webkit-line-clamp:2/);
console.log("S06-F04e : panneau cache hors session, observation locale sans ecriture, couleurs et navigation BT.");
