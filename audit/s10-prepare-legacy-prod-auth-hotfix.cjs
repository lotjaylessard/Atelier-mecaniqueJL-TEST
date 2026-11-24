#!/usr/bin/env node
"use strict";
// Safety-only hotfix preparation; OFFLINE, never publishes or contacts Supabase.
// Usage: node audit/s10-prepare-legacy-prod-auth-hotfix.cjs <legacy-index.html> <new-index.html>
// The caller must independently review the generated file and deploy after specific authorization.
const fs=require("node:fs"),path=require("node:path");
function refuse(msg){throw Error("AUTH_HOTFIX_REFUSED: "+msg)}
function patchLegacy(html){
 if(typeof html!=="string")refuse("source must be text");
 let s=html;
 const old=/async function supabaseLogin\(\)\s*\{\s*const email\s*=\s*["'][^"'\n]+["'];\s*const password\s*=\s*["'][^"'\n]+["'];\s*const \{ data, error \} = await sb\.auth\.signInWithPassword\(\{\s*email,\s*password\s*\}\);[\s\S]*?SUPABASE_USER\s*=\s*data\.user;[\s\S]*?\}/;
 if(!old.test(s))refuse("exact legacy embedded-password function not found; manual review needed");
 const safe=[
 "async function supabaseLogin(){",
 "  // Read the already-authenticated user's session; NEVER embed credentials.",
 "  const {data, error}=await sb.auth.getUser();",
 "  if(error || !data?.user){",
 "    window.location.replace(\"login.html\");",
 "    return false;",
 "  }",
 "  SUPABASE_USER=data.user;",
 "  return true;",
 "}"
 ].join("\n");
 s=s.replace(old,safe);
 const oldInit=/\(async function initApp\(\)\s*\{\s*await supabaseLogin\(\);\s*await loadCloudData\(\);\s*\}\)\(\);/;
 if(!oldInit.test(s))refuse("legacy init not found");
 s=s.replace(oldInit,'(async function initApp(){\n  if(!await supabaseLogin())return;\n  await loadCloudData();\n})();');
 // The legacy module contained an unconditional use of an undefined variable.
 const dangling=/\n\s*\/\/ Pas connecté -> dehors\s*\n\s*if \(!session\)\s*\{\s*window\.location\.replace\("login\.html"\);\s*\}/;
 if(!dangling.test(s))refuse("legacy dangling-session block not found");
 s=s.replace(dangling,"\n  // The auth check is performed by supabaseLogin via getUser().");
 if(s.includes("Hemidugaz2026!") || /const password\s*=\s*["'][^"'\n]+["']/.test(s))
   refuse("literal password still present in generated source");
 if(!s.includes("sb.auth.getUser()")||!s.includes("if(!await supabaseLogin())return"))
   refuse("session guard not present");
 return s;
}
if(require.main===module){
 try{
  const [inputFile,outFile]=process.argv.slice(2);
  if(!inputFile||!outFile)refuse("supply source + separate destination");
  const src=path.resolve(inputFile),out=path.resolve(outFile);
  if(src===out||fs.existsSync(out))refuse("output must be new and separate");
  const source=fs.readFileSync(src,"utf8"),result=patchLegacy(source);
  fs.writeFileSync(out,result,{flag:"wx",mode:0o600});
  console.log("LEGACY_AUTH_HOTFIX_PREPARED_OFFLINE_NO_DEPLOY");
 }catch(e){console.error(e.message);process.exitCode=1}
}
module.exports={patchLegacy};
