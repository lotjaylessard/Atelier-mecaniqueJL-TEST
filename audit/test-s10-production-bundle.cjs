#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),cp=require("node:child_process"),assert=require("node:assert/strict");
const script=path.join(__dirname,"s10-check-production-bundle.cjs");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"s10-prod-check-"));
const url=id=>"https://"+id+".supabase.co";
function run(index,login){
 fs.writeFileSync(path.join(root,"index.html"),index);
 fs.writeFileSync(path.join(root,"login.html"),login);
 return cp.spawnSync(process.execPath,[script,root],{encoding:"utf8"});
}
try{
 const prod="https://productionexample.supabase.co";
 let r=run('const db="'+prod+'";','const db="'+prod+'";');
 assert.equal(r.status,0,r.stdout+r.stderr);
 r=run('const db="'+url("nraijzsodgojkpyigefu")+'";','const db="'+prod+'";');
 assert.equal(r.status,1);
 assert.match(r.stdout,/Supabase TEST/);
 r=run('const db="'+prod+'";','const db="'+url("otherproject")+'";');
 assert.equal(r.status,1);
 assert.match(r.stdout,/deux projets différents/);
 r=run('const db="'+prod+'"; const prefix="ar_test_nraijzsodgojkpyigefu";','const db="'+prod+'";');
 assert.equal(r.status,1);
 r=run('const db="'+prod+'";','const db="'+prod+'"; const other="https://another.supabase.co";');
 assert.equal(r.status,1);
 fs.writeFileSync(path.join(root,"NO-GO-PROTOTYPE.txt"),"REVIEW ONLY");
 r=run('const db="'+prod+'";','const db="'+prod+'";');
 assert.equal(r.status,1,"A marked review candidate must NEVER pass the PROD gate");
 assert.match(r.stdout,/NON DÉPLOYABLE/);
 fs.rmSync(path.join(root,"NO-GO-PROTOTYPE.txt"));
 r=run('const db="'+prod+'"; <script src="audit/missing-runtime.js"></script>','const db="'+prod+'";');
 assert.equal(r.status,1,"Local script missing must fail deployment");
 assert.match(r.stdout,/ressource locale manquante/);
 r=run('const db="'+prod+'"; <img src="../private.json">','const db="'+prod+'";');
 assert.equal(r.status,1,"Parent path must fail deployment");
 assert.match(r.stdout,/chemin relatif interdit/);
 console.log("S10_BUNDLE_TESTS_OK : 8 scénarios.");
}finally{fs.rmSync(root,{recursive:true,force:true})}
