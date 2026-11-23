#!/usr/bin/env node
/* S08 TEST — validation hors ligne avant restauration dans un projet isolé.
 * Usage: node audit/s08-restore-preflight.cjs /chemin/garage-s08-physical-...
 * Lecture seule. N'écrit ni dans Supabase ni sur disque.
 */
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const assert=require("node:assert/strict");
const folder=process.argv[2];
if(!folder){console.error("Usage: node audit/s08-restore-preflight.cjs <dossier-sauvegarde>");process.exit(2)}
function digest(bytes){return crypto.createHash("sha256").update(bytes).digest("hex")}
function safePath(name){
 return typeof name==="string" && name.length>0 && name.length<2048 &&
 !name.startsWith("/") && !name.includes("\\") && !name.includes("\0") &&
 name.split("/").every(part=>part&&part!=="."&&part!==".."&&part.length<256);
}
function read(name){
 assert.ok(safePath(name),"Chemin dangereux: "+name);
 const base=path.resolve(folder),target=path.resolve(base,name);
 assert.ok(target.startsWith(base+path.sep),"Chemin hors dossier");
 for(let p=target;p!==base;p=path.dirname(p))
  assert.ok(!fs.lstatSync(p).isSymbolicLink(),"Lien symbolique refusé: "+name);
 return fs.readFileSync(target);
}
try{
 const manifest=JSON.parse(read("manifest.json").toString("utf8"));
 assert.equal(manifest.format,"atelier-test-physical-backup-v1");
 assert.equal(manifest.source,"Supabase TEST");
 assert.equal(manifest.bucket,"wo-files");
 assert.equal(manifest.status,"COMPLETE","Sauvegarde INCOMPLETE : restauration interdite");
 assert.deepEqual(manifest.missingTables,[],"Tables non couvertes");
 assert.deepEqual(manifest.failed,[],"Échecs signalés");
 assert.deepEqual(manifest.unresolvedReferences,[],"Références non résolues");
 const bytes=read("garage-data.json");
 assert.equal(bytes.length,manifest.snapshotBytes);
 assert.equal(digest(bytes),manifest.snapshotSha256);
 const snapshot=JSON.parse(bytes.toString("utf8"));
 assert.equal(snapshot.accountId,manifest.accountId);
 assert.equal(snapshot.createdAt,manifest.createdAt);
 assert.equal(snapshot.format,"atelier-test-full-garage-snapshot-v1");
 assert.ok(Array.isArray(snapshot.garages)&&snapshot.garages.length===1);
 assert.equal(snapshot.garages[0].garage_id,manifest.garageId);
 assert.ok(Array.isArray(snapshot.quotes));
 assert.equal(snapshot.quotes.length,manifest.quoteCount);
 assert.ok(snapshot.quotes.every(q=>q.garage_id===manifest.garageId));
 const tables=["garage_timer_sessions","garage_calendar_notes","garage_schedule_events"];
 for(const table of tables){
  const rows=snapshot.operational?.[table];
  assert.ok(Array.isArray(rows),"Table absente: "+table);
  assert.equal(rows.length,manifest.operationalCounts?.[table],"Comptage incohérent: "+table);
  assert.ok(rows.every(row=>row.garage_id===manifest.garageId&&row.user_id===manifest.accountId));
  assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
 }
 assert.ok(Array.isArray(manifest.memberIds)&&manifest.memberIds.includes(manifest.accountId));
 assert.equal(new Set(manifest.memberIds).size,manifest.memberIds.length);
 assert.ok(Array.isArray(manifest.files));
 assert.equal(manifest.files.length,manifest.fileCount);
 let total=0;
 const names=new Set();
 const refs=new Set();
 for(const garage of snapshot.garages){
  for(const wo of (Array.isArray(garage.data?.workorders)?garage.data.workorders:[])){
   for(const attachment of (Array.isArray(wo.attachments)?wo.attachments:[])){
    if(typeof attachment.path==="string")refs.add(attachment.path);
   }
  }
 }
 assert.equal(refs.size,manifest.referencedPaths);
 for(const item of manifest.files){
  assert.ok(safePath(item.path)&&!names.has(item.path),"Fichier invalide ou dupliqué");
  names.add(item.path);
  assert.equal(item.referenced,refs.has(item.path),"Référence incorrecte: "+item.path);
  const content=read("files/"+item.path);
  assert.equal(content.length,item.bytes,"Taille incorrecte: "+item.path);
  assert.equal(digest(content),item.sha256,"Empreinte incorrecte: "+item.path);
  total+=content.length;
 }
 assert.equal(total,manifest.totalBytes);
 assert.ok([...refs].every(p=>names.has(p)),"Pièces jointes BT manquantes");
 assert.ok(Array.isArray(manifest.ownedPathList));
 assert.equal(manifest.ownedPathList.length,manifest.ownedPaths);
 assert.equal(new Set(manifest.ownedPathList).size,manifest.ownedPathList.length);
 assert.ok(manifest.ownedPathList.every(p=>names.has(p)));
 console.log(JSON.stringify({result:"PREFLIGHT_OK",garageId:manifest.garageId,
  files:manifest.fileCount,quotes:manifest.quoteCount,
  operationalCounts:manifest.operationalCounts,
  note:"Intégrité locale uniquement. Aucune restauration SQL/Storage effectuée."},null,2));
}catch(error){
 console.error("PREFLIGHT_REFUSED: "+error.message);
 process.exitCode=1;
}
