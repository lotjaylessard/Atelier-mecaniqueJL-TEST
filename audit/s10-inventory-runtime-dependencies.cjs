#!/usr/bin/env node
/* S10 - inventaire des dépendances TEST dans les fichiers applicatifs.
   Lecture seule, aucune connexion à Supabase et aucune modification PROD. */
"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(process.argv[2]||".");
const targets=["index.html","login.html","img","integrations"];
const patterns=[
 ["TEST_SUPABASE_PROJECT",/nraijzsodgojkpyigefu/g],
 ["TEST_PUBLISHABLE_KEY",/sb_publishable_s0hqtqnGd4KgeyVr2Y4ltg_dI4qhjcA/g],
 ["TEST_STORAGE_PREFIX",/ar_test_[a-z0-9_]+/g],
 ["SUPABASE_ENDPOINT",/https:\/\/[a-z0-9-]+\.supabase\.co(?:\/[^\s"'<>)]*)?/gi],
 ["LOCAL_TEST_HOST",/localhost:8765|127\.0\.0\.1:8765/g]
];
const hits=[],files=[];
function scan(file){
 const stat=fs.lstatSync(file);
 if(stat.isSymbolicLink())return;
 if(stat.isDirectory()){for(const name of fs.readdirSync(file))scan(path.join(file,name));return}
 if(!stat.isFile()||stat.size>4e6)return;
 const buf=fs.readFileSync(file);
 if(buf.includes(0))return;
 const s=buf.toString("utf8");
 const rel=path.relative(root,file);
 files.push(rel);
 for(const [name,re] of patterns){
  for(const match of s.matchAll(re)){
   const line=s.slice(0,match.index).split("\n").length;
   hits.push({file:rel,line,type:name,value:name==="SUPABASE_ENDPOINT"?match[0].split("/functions/")[0]:"[masqué]"});
  }
 }
}
for(const target of targets){const p=path.join(root,target);if(fs.existsSync(p))scan(p)}
const counts=Object.fromEntries(patterns.map(([name])=>[name,hits.filter(x=>x.type===name).length]));
console.log(JSON.stringify({scannedFiles:files.length,counts,hits,note:"Inventaire lecture seule; les valeurs de clé sont masquées. Aucun déploiement."},null,2));
