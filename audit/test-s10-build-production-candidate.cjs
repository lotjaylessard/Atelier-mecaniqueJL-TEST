"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),cp=require("node:child_process");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"s10-candidate-")),src=path.join(root,"src");
fs.mkdirSync(src);
const builder=path.join(__dirname,"s10-build-production-candidate.cjs");
const testUrl="https://nraijzsodgojkpyigefu.supabase.co",testKey="sb_publishable_s0hqtqnGd4KgeyVr2Y4ltg_dI4qhjcA";
const prodUrl="https://feeapfylfzlvgnqtglnh.supabase.co",prodKey="sb_publishable_abcdefghijklmnopqrstuvwxyz";
function run(out,url=prodUrl,key=prodKey){return cp.spawnSync(process.execPath,[builder,src,out,url,key],{encoding:"utf8"})}
try{
 const initial=`const db="${testUrl}"; const key="${testKey}";
 // TEST uniquement : espace local distinct de la production GitHub Pages.
 // Ne jamais lire, migrer ou effacer les anciennes cles de production.
 const TEST_STORAGE_PREFIX = "ar_test_nraijzsodgojkpyigefu";
 let k = \`\${TEST_STORAGE_PREFIX}_bootstrap_invoices_v2\`;
 function configureGarageStorage(garageId){return \`\${TEST_STORAGE_PREFIX}_\${garageId}_invoices_v2\`;}
 async function loadCloudData(){}
 function hydrateLocalFromCloud(cloudData){}
 configureGarageStorage(ACTIVE_GARAGE_ID);
 const cloudLoaded = await loadCloudData();
 hydrateLocalFromCloud(cloudData);
 sb.storage.from("wo-files").createSignedUrl(path,3600);
 /* MIGRATION DES ANCIENNES CLES DESACTIVEE EN TEST.
    Ne jamais recopier les donnees locales de production dans TEST.
    La base Supabase TEST est la seule source pour l'hydratation initiale. */`;
 fs.writeFileSync(path.join(src,"index.html"),initial);
 fs.writeFileSync(path.join(src,"login.html"),`const db="${testUrl}"; const key="${testKey}";`);
 fs.mkdirSync(path.join(src,"img"));fs.writeFileSync(path.join(src,"img","logov2.png"),"static-only");
 let r=run(path.join(root,"out"));assert.equal(r.status,0,r.stderr);
 const out=fs.readFileSync(path.join(root,"out","index.html"),"utf8");
 assert.match(out,/PROD_STORAGE_PREFIX = "ar_prod_feeapfylfzlvgnqtglnh"/);
 assert.doesNotMatch(out,/TEST_STORAGE_PREFIX|nraijzsodgojkpyigefu/);
 assert.ok(out.includes(prodUrl)&&out.includes(prodKey));
 assert.match(out,/Preserve historical ar_<user>_\* local keys/);
 assert.match(out,/hydrateLocalFromCloud\(cloudData\)/);
 assert.equal(fs.readFileSync(path.join(root,"out","img","logov2.png"),"utf8"),"static-only");
 assert.ok(fs.readFileSync(path.join(root,"out","NO-GO-PROTOTYPE.txt"),"utf8").includes("NOT DEPLOYABLE"));
 assert.ok(fs.readFileSync(path.join(src,"index.html"),"utf8").includes(testUrl));
 r=run(path.join(root,"wrong"),"https://productionexample.supabase.co");assert.notEqual(r.status,0);
 r=run(path.join(root,"badkey"),prodUrl,testKey);assert.notEqual(r.status,0);
 r=run(src);assert.notEqual(r.status,0);
 // Fail closed if the source app's safe hydrating sequence is changed.
 fs.writeFileSync(path.join(src,"index.html"),initial.replace("hydrateLocalFromCloud(cloudData);","void(cloudData);"));
 r=run(path.join(root,"unsafe"));assert.notEqual(r.status,0);
 // No partial output on validation failure.
 assert.ok(!fs.existsSync(path.join(root,"unsafe")));
 console.log("S10_CANDIDATE_TESTS_OK: prod namespace, cloud hydration, static assets, 4 rejection cases.");
}finally{fs.rmSync(root,{recursive:true,force:true})}
