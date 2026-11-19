'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const a=html.indexOf('async function jlScheduleLoadExternalConnections(){');
const b=html.indexOf('function jlScheduleBindEvents(){',a);
assert.ok(a>0&&b>a,'External calendar controller');
const src=html.slice(a,b);
test('account connection panel is under Settings and closed until expanded',()=>{
 assert.match(html,/id="jlCalendarSettings"/);
 assert.match(html,/<summary>📅 Calendriers personnels — connexions<\/summary>/);
 assert.match(html,/id="jlScheduleCalendarsPanel"/);
 assert.doesNotMatch(html,/id="jlScheduleCalendarsToggle"/);
 assert.match(html,/jlCalendarSettings"\)\.addEventListener\("toggle"/);
 assert.match(html,/jlScheduleInitSettings\(\)/);
});
test('external calendars read only status metadata with both owner and garage filters',()=>{
 assert.match(src,/from\("garage_external_calendar_connections"\)/);
 assert.match(src,/\.select\("id,provider,display_name,sync_status,last_synced_at"\)/);
 assert.match(src,/\.eq\("garage_id",ACTIVE_GARAGE_ID\)\.eq\("user_id",auth.user.id\)/);
 assert.doesNotMatch(src,/\.insert\(|\.update\(|\.delete\(/);
});
test('no external OAuth tokens or fake connection buttons are exposed',()=>{
 assert.doesNotMatch(src,/refresh_token|access_token|client_secret|service_role/);
 assert.match(html,/Connexion Google TEST en attente de configuration OAuth/);
 assert.match(html,/id="jlScheduleConnectGoogle"[^>]*disabled/);
});
test('two providers have separated labels and untrusted values use textContent',()=>{
 assert.match(html,/id="jlScheduleExternalGoogle"/);
 assert.match(html,/id="jlScheduleExternalMicrosoft"/);
 assert.match(src,/document.getElementById\(id\)\.textContent=label/);
 assert.doesNotMatch(src,/innerHTML/);
});

test('connected Google changes the button into a real disconnect action',()=>{
 assert.match(html,/googleButton\.textContent=connectedGoogle\?"Déconnecter Google Calendar":"Connecter Google Calendar"/);
 assert.match(html,/async function jlScheduleDisconnectGoogle\(\)/);
 assert.match(html,/if\(jlScheduleGoogleConnectionId\)void jlScheduleDisconnectGoogle\(\)/);
 assert.match(html,/window\.confirm\("Déconnecter "/);
 assert.match(html,/action:"disconnect",garage_id:ACTIVE_GARAGE_ID,connection_id:connectionId/);
});
