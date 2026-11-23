#!/usr/bin/env node
/* S08 : rapport métier local en lecture seule sur un export partiel vérifié.
 * N'autorise ni restauration ni migration. Aucun envoi réseau.
 */
"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const folder=process.argv[2];
if(!folder){console.error("Usage: node audit/s08-business-inventory.cjs <dossier-S08>");process.exit(2)}
const verified=cp.spawnSync(process.execPath,[path.join(__dirname,"s08-verify-partial-export.cjs"),folder],{encoding:"utf8",maxBuffer:1024*1024});
if(verified.error||verified.status!==0){console.error("S08_INVENTORY_REFUSED: intégrité préalable refusée: "+(verified.stderr||verified.error?.message||"erreur"));process.exit(1)}
try{
 const snapshot=JSON.parse(fs.readFileSync(path.join(folder,"garage-data.json"),"utf8"));
 const data=snapshot.garages[0].data;
 if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Structure garage.data invalide");
 const names=["clients","vehicles","workorders","invoices","parts_inventory","services","settings"];
 const sections={};
 for(const name of names){
  const value=data[name];
  sections[name]=value===undefined?{state:"absent"}:
   Array.isArray(value)?{state:"array",count:value.length}:
   {state:typeof value};
 }
 const warnings=[];
 for(const name of ["clients","vehicles","workorders","invoices"]){
  const value=data[name];
  if(value!==undefined&&!Array.isArray(value))warnings.push(name+" n'est pas une liste");
  if(Array.isArray(value)){
   const ids=value.map(x=>x&&typeof x==="object"?x.id:undefined).filter(x=>x!==undefined&&x!==null&&x!=="");
   if(new Set(ids.map(String)).size!==ids.length)warnings.push(name+" contient des identifiants id dupliqués");
  }
 }
 const quotes=snapshot.quotes;
 const quoteIds=quotes.map(x=>x?.id).filter(x=>x!==undefined&&x!==null);
 if(new Set(quoteIds.map(String)).size!==quoteIds.length)warnings.push("Identifiants de soumission dupliqués");
 const files=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json"),"utf8")).files;
 const report={
  result:warnings.length?"S08_BUSINESS_REVIEW_REQUIRED":"S08_BUSINESS_INVENTORY_OK",
  scope:"Export TEST PARTIEL, propriétaire uniquement",
  sections,quotes:quotes.length,files:files.length,
  operational:Object.fromEntries(Object.entries(snapshot.operational).map(([name,rows])=>[name,rows.length])),
  warnings,
  limitations:["Aucune vérification des relations clients/véhicules/BT/factures sans contrat de schéma confirmé",
   "Aucune donnée privée des autres membres garantie","Aucune restauration SQL applicative","Aucun accès PROD"]
 };
 console.log(JSON.stringify(report,null,2));
 if(warnings.length)process.exitCode=1;
}catch(e){console.error("S08_INVENTORY_REFUSED: "+e.message);process.exitCode=1}
