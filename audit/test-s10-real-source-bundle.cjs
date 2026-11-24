#!/usr/bin/env node
/* S10: end-to-end packaging test against REAL checked-out application.
 * Creates only a temporary throwaway candidate with a fake publishable key.
 * No database, authentication or network requests; no production deployment.
 */
"use strict";
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const cp=require("node:child_process");
const assert=require("node:assert/strict");

const repo=path.resolve(__dirname,"..");
const base=fs.mkdtempSync(path.join(os.tmpdir(),"jl-s10-real-source-"));
const dest=path.join(base,"review-candidate");
const prodUrl="https://feeapfylfzlvgnqtglnh.supabase.co";
const fakeKey="sb_publishable_s10_check_only_never_use_live_123456";
function node(script,...args){
 return cp.spawnSync(process.execPath,[path.join(repo,"audit",script),...args],{
  encoding:"utf8",maxBuffer:2*1024*1024
 });
}
function pathsFromHtml(html){
 const urls=[];
 const regex=/<(?:script|img|link)\\b[^>]*?\\b(?:src|href)\\s*=\\s*["']([^"']+)["']/gi;
 for(const m of html.matchAll(regex)){
  const uri=m[1];
  if(/^(?:https?:|data:|blob:|\\/\\/|#)/i.test(uri))continue;
  const rel=path.posix.normalize((uri.startsWith("./")?uri.slice(2):uri).split(/[?#]/)[0]);
  assert.ok(rel && !rel.startsWith("../") && !rel.startsWith("/"),"Unsafe local reference: "+uri);
  urls.push(rel);
 }
 return [...new Set(urls)].sort();
}
try{
 const built=node("s10-build-production-candidate.cjs",repo,dest,prodUrl,fakeKey);
 assert.equal(built.status,0,"Real app candidate generation failed: "+built.stderr);
 const files=["index.html","login.html"];
 for(const file of files){
  const html=fs.readFileSync(path.join(dest,file),"utf8");
  assert.ok(html.includes(prodUrl),file+" has no PROD URL");
  assert.ok(html.includes(fakeKey),file+" has no placeholder publishable key");
  assert.ok(!html.includes("nraijzsodgojkpyigefu"),file+" leaks TEST project");
  assert.ok(!html.includes("ar_prod_candidate"),file+" uses unsafe provisional cache");
  for(const asset of pathsFromHtml(html)){
   const p=path.join(dest,...asset.split("/"));
   assert.ok(fs.statSync(p).isFile(),file+" references missing asset "+asset);
   if(asset.endsWith(".js")){
    const check=cp.spawnSync(process.execPath,["--check",p],{encoding:"utf8"});
    assert.equal(check.status,0,"Invalid runtime JavaScript "+asset+": "+check.stderr);
   }
  }
 }
 const index=fs.readFileSync(path.join(dest,"index.html"),"utf8");
 const expected=["img/logov2.png","audit/s06-live-test.js",
  "audit/s06-wo-pilot.js","audit/s06-sidebar-persistent.js"];
 const linked=pathsFromHtml(index);
 for(const asset of expected)assert.ok(linked.includes(asset),"Critical runtime asset absent: "+asset);
 assert.ok(index.includes("const PROD_STORAGE_PREFIX = \"ar_prod_feeapfylfzlvgnqtglnh\""));
 assert.ok(index.includes("hydrateLocalFromCloud(cloudData)"));
 assert.ok(fs.existsSync(path.join(dest,"NO-GO-PROTOTYPE.txt")),"Missing mandatory NO-GO marker");
 const check=node("s10-check-production-bundle.cjs",dest);
 assert.notEqual(check.status,0,"Review candidate unexpectedly eligible for live deployment");
 assert.match(check.stdout,/NON DÉPLOYABLE/);
 console.log("S10_REAL_SOURCE_BUNDLE_OK: full checked-out site, "+linked.length+
  " local runtime assets, valid JS syntax, PROD-only config and hard NO-GO.");
}finally{
 fs.rmSync(base,{recursive:true,force:true});
}
