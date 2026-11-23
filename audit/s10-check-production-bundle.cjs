#!/usr/bin/env node
/* S10 - contrôle hors ligne du paquet web candidat à la production.
 * Lecture seule. Ne déploie rien et ne modifie aucun fichier.
 * Usage: node audit/s10-check-production-bundle.cjs <dossier-candidat>
 */
"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=process.argv[2];
if(!root){console.error("Usage: node audit/s10-check-production-bundle.cjs <dossier-candidat>");process.exit(2)}
const base=path.resolve(root);
const files=["index.html","login.html"];
const errors=[];
const info=[];
for(const file of files){
 const filename=path.join(base,file);
 if(!fs.existsSync(filename)){errors.push(file+" absent");continue}
 const source=fs.readFileSync(filename,"utf8");
 const checks=[
  [/nraijzsodgojkpyigefu/gi,"Référence projet Supabase TEST"],
  [/ar_test_nraijzsodgojkpyigefu/gi,"Préfixe de stockage TEST"],
  [/ar_prod_candidate/gi,"Préfixe provisoire de stockage non validé"],
  [/MIGRATION DES ANCIENNES CLES NON VALIDEE POUR PROD/gi,"Migration du stockage local non validée"],
  [/garage-calendar-oauth[^\s"']*test/gi,"Endpoint OAuth TEST"]
 ];
 for(const [regex,label] of checks)if(regex.test(source))errors.push(file+" : "+label);
 const urls=[...source.matchAll(/https:\/\/([a-z0-9-]+)\.supabase\.co/gi)].map(m=>m[1].toLowerCase());
 const projects=[...new Set(urls)];
 if(projects.length!==1)errors.push(file+" : attendu exactement un projet Supabase, trouvé "+projects.length);
 info.push({file,project:projects.length===1?projects[0]:"NON_UNIQUE"});
}
if(info.length===2&&info[0].project!==info[1].project)errors.push("index.html et login.html pointent vers deux projets différents");
if(info.some(x=>x.project==="NON_UNIQUE"))errors.push("Configuration Supabase incomplète ou ambiguë");
const result={result:errors.length?"NO_GO":"CONFIG_STATIC_OK",files:info,errors,
 note:"Contrôle statique seulement : ne valide ni clés, schéma SQL, RLS, Edge Functions, Auth ni sauvegarde PROD. Aucune écriture."};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
