"use strict";
/* Release audit of the actual versioned calendar Edge Function candidates.
 * This is a source-only gate; never deploys a function, accesses cloud data,
 * prints private calendar feeds, or reads secret values.
 */
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const root=path.join(__dirname,"edge-candidate");
const names=[
 "garage-calendar-oauth",
 "garage-familywall-calendar",
 "garage-outlook-ical",
 "garage-microsoft-calendar"
];
const report=[];
for(const name of names){
 const base=path.join(root,name);
 const main=path.join(base,"index.ts");
 assert.ok(fs.statSync(main).isFile(),"Missing Edge Function source "+name);
 const code=fs.readFileSync(main,"utf8");
 assert.ok(code.includes('Deno.env.get("SUPABASE_URL")'),name+" must target the deployed Supabase project");
 assert.ok(code.includes("/auth/v1/user"),name+" missing application JWT verification endpoint");
 assert.match(code,/authorization/i,name+" missing bearer handling");
 assert.match(code,/Deno\.serve\(/,name+" missing HTTP handler");
 assert.ok(!code.includes("nraijzsodgojkpyigefu"),name+" contains TEST project URL");
 assert.ok(!code.includes("feeapfylfzlvgnqtglnh"),name+" contains a fixed PROD project URL");
 assert.ok(!/sb_secret_[a-z0-9_-]{10,}/i.test(code),name+" contains embedded secret key");
 assert.ok(!/sb_publishable_[a-z0-9_-]{10,}/i.test(code),name+" contains embedded frontend key");
 if(name==="garage-calendar-oauth"||name==="garage-microsoft-calendar"){
   assert.match(code,/replace\(\/\\\/\$\/,\s*""\)/,name+" requires origin-based OAuth callback");
   assert.match(code,/\/functions\/v1\//,name+" requires Edge callback path");
 }
 const deps=[...code.matchAll(/from\s+["'](\.\/[^"']+)["']/g)].map(m=>m[1]);
 for(const dep of deps){
   const resolved=path.resolve(base,dep);
   assert.ok(resolved.startsWith(base+path.sep),"Unexpected Edge dependency path");
   assert.ok(fs.statSync(resolved).isFile(),name+" missing dependency "+dep);
   const imported=fs.readFileSync(resolved,"utf8");
   assert.ok(!imported.includes("nraijzsodgojkpyigefu"),name+" dependency has TEST reference");
 }
 report.push({function:name,source_present:true,relative_imports:deps.length,
  app_jwt_check_present:true});
}
console.log("S10_EDGE_PROD_SOURCES_READY_FOR_REVIEW "+JSON.stringify(report));
console.log("NO-GO: no deployed functions in PROD, no PROD secrets/redirects configured, no live user-session QA.");
