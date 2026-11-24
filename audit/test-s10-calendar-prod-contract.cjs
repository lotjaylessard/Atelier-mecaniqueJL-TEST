"use strict";
/* PROD calendar release contract. No live requests or secret values. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"edge-candidate");
const source=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const builder=fs.readFileSync(path.join(__dirname,"s10-build-production-candidate.cjs"),"utf8");
const prod="feeapfylfzlvgnqtglnh",test="nraijzsodgojkpyigefu";
const core=["garage-calendar-oauth","garage-familywall-calendar","garage-outlook-ical"];
const extra="garage-microsoft-calendar";
for(const slug of [...core,extra]){
 const ts=fs.readFileSync(path.join(root,slug,"index.ts"),"utf8");
 assert.ok(!ts.includes(test)&&!ts.includes(prod),slug+" must derive project URL at runtime");
 assert.match(ts,/Deno\.env\.get\("SUPABASE_URL"\)/,slug+" must use runtime Supabase URL");
 assert.match(ts,/\/auth\/v1\/user/,slug+" must verify user token in code");
 assert.ok(!/\bTEST\b/.test(ts),slug+" should not display TEST messages after production promotion");
 const needed=[...ts.matchAll(/from\s+["'](\.\/[^"']+)["']/g)].map(m=>m[1]);
 for(const relative of needed)assert.ok(fs.existsSync(path.join(root,slug,relative)),slug+" missing import "+relative);
 if(core.includes(slug))assert.ok(source.includes("/functions/v1/"+slug),"Current browser does not call required "+slug);
 else assert.ok(!source.includes("/functions/v1/"+slug),"Microsoft OAuth is not used by the current browser; keep optional");
}
assert.ok(source.includes("https://"+test+".supabase.co/functions/v1/garage-calendar-oauth"));
assert.ok(source.includes("https://"+test+".supabase.co/functions/v1/garage-familywall-calendar"));
assert.ok(source.includes("https://"+test+".supabase.co/functions/v1/garage-outlook-ical"));
assert.ok(builder.includes("html.replaceAll(testUrl,url)"),"Builder must rewrite every TEST calendar URL");
assert.ok(builder.includes("TEST_REF")&&builder.includes("PROD_REF"));
for(const name of ["garage-calendar-oauth","garage-microsoft-calendar"]){
 const ts=fs.readFileSync(path.join(root,name,"index.ts"),"utf8");
 assert.ok(ts.includes('/functions/v1/'+name),"OAuth callback must be derived from the same function slug");
}
for(const name of ["garage-familywall-calendar","garage-outlook-ical"]){
 const ts=fs.readFileSync(path.join(root,name,"index.ts"),"utf8");
 assert.ok(ts.includes("GOOGLE_CALENDAR_ENCRYPTION_KEY_HEX"),"Private feed encryption secret missing");
}
console.log("S10_CALENDAR_PROD_RUNTIME_CONTRACT_OK: 3 mandatory functions, 1 optional, production callbacks, no TEST text, no hardcoded project IDs");
console.log("NO-GO: no PROD OAuth setup, secrets, Auth session, or calendar feed migration verified.");
