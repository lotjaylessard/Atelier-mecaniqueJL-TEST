#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const html=fs.readFileSync(path.join(__dirname,"..","login.html"),"utf8");
const code=html.match(/<script\s+type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(code,"missing login module");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
new AsyncFunction(code.replace(/^\s*import\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?/m,""));
assert.match(code,/event==="PASSWORD_RECOVERY"/,"password recovery event must remain");
assert.match(code,/inviteMode=inviteHint && inviteProof && !recoveryHint/,"invite requires auth proof");
assert.match(code,/fragmentParams\.has\("access_token"\) && fragmentParams\.has\("refresh_token"\)/,"fragment invite token proof required");
assert.match(code,/searchParams\.has\("token_hash"\) \|\| searchParams\.has\("code"\)/,"query callback invite support required");
assert.match(code,/inviteMode && inviteProof && session/,"invite needs actual Supabase session");
assert.match(code,/inviteMode&&inviteReady&&inviteProof/,"setting password must reject unverified invite");
assert.match(code,/supabase\.auth\.updateUser\(\{password\}\)/,"password set must use signed-in user API");
assert.match(code,/await supabase\.auth\.signOut\(\)/,"session must sign out after password setup");
assert.match(code,/location\.replace\("index\.html"\)/,"existing successful login redirect retained");
assert.match(code,/supabase\.auth\.signInWithPassword/,"normal login preserved");
console.log("S10_AUTH_INVITE_PASSWORD_SETUP_GUARDS_OK");
