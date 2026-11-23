#!/usr/bin/env node
/* S10: prepare an isolated PROD review candidate. Never deploys or writes DB.
 * Cloud PROD remains the source of truth. Historical browser keys are untouched.
 * Usage: node audit/s10-build-production-candidate.cjs <TEST-source> <NEW-output> <PROD-url> <PROD-publishable-key>
 */
"use strict";
const fs=require("node:fs"),path=require("node:path");
const [sourceArg,outArg,url,key]=process.argv.slice(2);
const TEST_REF="nraijzsodgojkpyigefu",PROD_REF="feeapfylfzlvgnqtglnh";
const testUrl=`https://${TEST_REF}.supabase.co`;
const testKey="sb_publishable_s0hqtqnGd4KgeyVr2Y4ltg_dI4qhjcA";
const prefix="ar_prod_"+PROD_REF; // namespaced by project AND active garage at runtime
function fail(message){throw Error(message)}
function replaceExactly(source,marker,replacement,file){
 const count=source.split(marker).length-1;
 if(count!==1)fail(file+": expected exactly one marker "+marker+"; found "+count);
 return source.replace(marker,replacement);
}
try{
 if(!sourceArg||!outArg||!url||!key)fail("Usage: node audit/s10-build-production-candidate.cjs <source> <new-output> <prod-url> <prod-publishable-key>");
 const src=fs.realpathSync(sourceArg),out=path.resolve(outArg);
 if(out===src||out.startsWith(src+path.sep)||src.startsWith(out+path.sep)||fs.existsSync(out))
   fail("Output must be NEW and separate from sources");
 if(url!==`https://${PROD_REF}.supabase.co`)fail("Wrong PROD project URL");
 if(!/^sb_publishable_[a-zA-Z0-9_-]{10,}$/.test(key)||key===testKey)fail("PROD publishable key required (never service_role)");
 const result={};
 for(const file of ["index.html","login.html"]){
   let html=fs.readFileSync(path.join(src,file),"utf8");
   if(!html.includes(testUrl)||!html.includes(testKey))fail(file+": TEST configuration markers missing");
   html=html.replaceAll(testUrl,url).replaceAll(testKey,key);
   if(file==="index.html"){
     html=replaceExactly(html,
       'const TEST_STORAGE_PREFIX = "ar_test_nraijzsodgojkpyigefu";',
       `const PROD_STORAGE_PREFIX = "${prefix}";`,file);
     // All cached garage keys and recoverable-unsynced markers keep the same
     // logic but now use a PROD-only prefix. Legacy ar_<user>_* keys are neither
     // read nor deleted; verified PROD garage_data hydrates the new cache.
     html=html.replaceAll("TEST_STORAGE_PREFIX","PROD_STORAGE_PREFIX");
     html=replaceExactly(html,
       "// TEST uniquement : espace local distinct de la production GitHub Pages.\n// Ne jamais lire, migrer ou effacer les anciennes cles de production.",
       "// PROD candidate: namespace cache by project and garage.\n// Preserve historical ar_<user>_* local keys without reading or deleting them.",file);
     html=replaceExactly(html,
       "/* MIGRATION DES ANCIENNES CLES DESACTIVEE EN TEST.\n   Ne jamais recopier les donnees locales de production dans TEST.\n   La base Supabase TEST est la seule source pour l'hydratation initiale. */",
       "/* PROD candidate: cloud garage_data is authoritative after membership checks.\n   Do not import browser legacy data, TEST data or unsynced recovery snapshots.\n   Preserve old localStorage keys; require verified PROD backup before cutover. */",file);
     if(!html.includes("configureGarageStorage(ACTIVE_GARAGE_ID)")||
        !html.includes("const cloudLoaded = await loadCloudData()")||
        !/\bhydrateLocalFromCloud\(cloudData\)\s*;/.test(html)||
        !html.includes(".createSignedUrl("))
       fail("Cloud hydration / garage isolation / signed file URL guard missing");
   }
   if(html.includes(TEST_REF)||html.includes(testKey)||html.includes("TEST_STORAGE_PREFIX"))
     fail(file+": TEST identifier remains after conversion");
   result[file]=html;
 }
 // Copy only the real runtime resources referenced by the application.
 // Do not copy audits, test records, backups, SQL dumps or credentials.
 const allowedRuntimeAssets=[
   "img/logov2.png",
   "audit/s06-live-test.js",
   "audit/s06-wo-pilot.js",
   "audit/s06-sidebar-persistent.js"
 ];
 const localLinks=[];
 for(const html of Object.values(result)){
   for(const match of html.matchAll(/<(?:script|img|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)){
     const uri=match[1];
     if(/^(?:https?:|data:|blob:|\/\/|#)/i.test(uri))continue;
     const normalized=path.posix.normalize((uri.startsWith("./")?uri.slice(2):uri).split(/[?#]/)[0]);
     if(!normalized||normalized.startsWith("../")||normalized.startsWith("/"))
       fail("Unexpected relative runtime asset path: "+uri);
     localLinks.push(normalized);
     if(!allowedRuntimeAssets.includes(normalized))
       fail("Unreviewed runtime asset referenced: "+normalized);
   }
 }
 for(const asset of [...new Set(localLinks)]){
   const input=path.join(src,...asset.split("/"));
   if(!fs.existsSync(input)||!fs.statSync(input).isFile())
     fail("Runtime asset missing from source: "+asset);
 }
 // Validating every input BEFORE creating the output prevents partial candidates.
 fs.mkdirSync(out,{recursive:false});
 for(const [file,html] of Object.entries(result))
   fs.writeFileSync(path.join(out,file),html,{mode:0o600});
 for(const asset of [...new Set(localLinks)]){
   const input=path.join(src,...asset.split("/"));
   const output=path.join(out,...asset.split("/"));
   fs.mkdirSync(path.dirname(output),{recursive:true});
   fs.copyFileSync(input,output);
 }
 fs.writeFileSync(path.join(out,"NO-GO-PROTOTYPE.txt"),
   "PRODUCTION REVIEW CANDIDATE -- NOT DEPLOYABLE.\n"+
   "Cloud PROD is authoritative, existing localStorage keys must remain untouched.\n"+
   "STOP until verified PROD backup/restore, multi-user browser QA, RLS/storage "+
   "cutover and Edge Functions configuration are completed.\n");
 console.log("S10_PROD_REVIEW_CANDIDATE_CREATED_NOT_DEPLOYABLE : "+out);
 console.log("No database changes, no legacy browser data migration, no production deploy.");
}catch(err){console.error("S10_BUILD_REFUSED: "+err.message);process.exitCode=1}
