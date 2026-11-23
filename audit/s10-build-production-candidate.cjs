#!/usr/bin/env node
/* S10: construit un paquet candidat PROD en dossier séparé.
 * Ne déploie rien, ne contacte aucun serveur, ne modifie jamais les sources.
 * Usage:
 * node audit/s10-build-production-candidate.cjs <dossier-source-TEST> <dossier-sortie-NOUVEAU> <url-Supabase-PROD> <clé-publique-PROD>
 */
"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const [sourceArg,outArg,url,key]=process.argv.slice(2);
function fail(msg){throw Error(msg)}
try{
 if(!sourceArg||!outArg||!url||!key)fail("Usage: node audit/s10-build-production-candidate.cjs <source> <sortie-nouvelle> <url-prod> <clé-publique-prod>");
 const src=fs.realpathSync(sourceArg),out=path.resolve(outArg);
 if(out===src||out.startsWith(src+path.sep)||src.startsWith(out+path.sep)||fs.existsSync(out))fail("Dossier de sortie doit être nouveau et séparé des sources");
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||url.includes("nraijzsodgojkpyigefu"))fail("URL PROD invalide ou TEST");
 if(!/^sb_publishable_[a-zA-Z0-9_-]{10,}$/.test(key)||key==="sb_publishable_s0hqtqnGd4KgeyVr2Y4ltg_dI4qhjcA")fail("Clé publique PROD invalide ou TEST");
 const files=["index.html","login.html"];
 const testUrl="https://nraijzsodgojkpyigefu.supabase.co",testKey="sb_publishable_s0hqtqnGd4KgeyVr2Y4ltg_dI4qhjcA";
 const replacements={};
 for(const file of files){
  let s=fs.readFileSync(path.join(src,file),"utf8");
  if(!s.includes(testUrl)||!s.includes(testKey))fail("Marqueurs TEST attendus manquants dans "+file);
  s=s.replaceAll(testUrl,url).replaceAll(testKey,key);
  // Le préfixe TEST ne doit jamais être copié tel quel en production.
  // La stratégie de stockage PROD doit être approuvée avant de générer un paquet.
  if(file==="index.html"){
   const marker='const TEST_STORAGE_PREFIX = "ar_test_nraijzsodgojkpyigefu";';
   if(!s.includes(marker))fail("Préfixe TEST introuvable; adaptation manuelle nécessaire");
   s=s.replace(marker,'const GARAGE_STORAGE_PREFIX = "ar_prod_candidate";\nconst TEST_STORAGE_PREFIX = GARAGE_STORAGE_PREFIX;');
   // Ne pas prétendre restaurer les anciennes clés locales.
   s=s.replace('MIGRATION DES ANCIENNES CLES DESACTIVEE EN TEST.','MIGRATION DES ANCIENNES CLES NON VALIDEE POUR PROD.');
  }
  replacements[file]=s;
 }
 fs.mkdirSync(out,{recursive:false});
 for(const [file,s] of Object.entries(replacements))fs.writeFileSync(path.join(out,file),s,{mode:0o600});
 const check=cp.spawnSync(process.execPath,[path.join(__dirname,"s10-check-production-bundle.cjs"),out],{encoding:"utf8"});
 if(check.status!==0)fail("Contrôle paquet refusé : "+check.stdout);
 console.log("S10_CANDIDATE_CREATED : "+out);
 console.log("ATTENTION: prototype de configuration uniquement. Pas de déploiement, pas de migration localStorage, pas de validation RLS/Auth/Storage. NO-GO.");
}catch(e){console.error("S10_BUILD_REFUSED: "+e.message);process.exitCode=1}
