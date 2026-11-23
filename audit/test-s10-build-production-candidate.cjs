"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),cp=require("node:child_process");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"s10-candidate-")),src=path.join(root,"src");
fs.mkdirSync(src);
const script=path.join(__dirname,"s10-build-production-candidate.cjs");
const testUrl="https://nraijzsodgojkpyigefu.supabase.co",testKey="sb_publishable_s0hqtqnGd4KgeyVr2Y4ltg_dI4qhjcA";
const prodUrl="https://productionexample.supabase.co",prodKey="sb_publishable_abcdefghijklmnopqrstuvwxyz";
function run(out,url=prodUrl,key=prodKey){return cp.spawnSync(process.execPath,[script,src,out,url,key],{encoding:"utf8"})}
try{
 fs.writeFileSync(path.join(src,"index.html"),'const db="'+testUrl+'"; const key="'+testKey+'"; const TEST_STORAGE_PREFIX = "ar_test_nraijzsodgojkpyigefu"; /* MIGRATION DES ANCIENNES CLES DESACTIVEE EN TEST. */');
 fs.writeFileSync(path.join(src,"login.html"),'const db="'+testUrl+'"; const key="'+testKey+'";');
 let r=run(path.join(root,"out"));assert.equal(r.status,0,r.stderr);
 const out=fs.readFileSync(path.join(root,"out","index.html"),"utf8");
 assert.ok(out.includes(prodUrl));assert.ok(out.includes(prodKey));assert.ok(!out.includes(testUrl));
 assert.ok(fs.readFileSync(path.join(src,"index.html"),"utf8").includes(testUrl));
 r=run(path.join(root,"bad"),testUrl);assert.notEqual(r.status,0);
 r=run(path.join(root,"badkey"),prodUrl,testKey);assert.notEqual(r.status,0);
 r=run(src);assert.notEqual(r.status,0);
 console.log("S10_CANDIDATE_TESTS_OK : 4 scénarios, sources TEST intactes.");
}finally{fs.rmSync(root,{recursive:true,force:true})}
