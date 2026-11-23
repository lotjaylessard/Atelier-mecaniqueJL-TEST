#!/usr/bin/env node
/* S08 : importer un snapshot PARTIEL dans une table de quarantaine locale.
 * Ne restaure PAS le schéma applicatif Supabase, Auth, Storage ou RLS.
 * Usage : node audit/s08-stage-local-postgres.cjs /chemin/garage-s08-physical-...
 * Précondition : PostgreSQL local atelier_s08_restore et sudo -n root.
 */
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),cp=require("node:child_process");
const folder=process.argv[2];
function fail(msg){throw Error(msg)}
try{
 if(!folder)fail("Usage : node audit/s08-stage-local-postgres.cjs <dossier-export-S08>");
 const base=fs.realpathSync(folder);
 function read(name){
  if(!name||name.startsWith("/")||name.includes("\\")||name.split("/").some(x=>!x||x==="."||x===".."))fail("Chemin invalide");
  const file=path.resolve(base,name);
  if(!file.startsWith(base+path.sep))fail("Hors dossier");
  for(let p=file;p!==base;p=path.dirname(p))if(fs.lstatSync(p).isSymbolicLink())fail("Lien symbolique");
  return fs.readFileSync(file);
 }
 // Utiliser le vérificateur complet déjà existant plutôt que dupliquer les garde-fous.
 const verify=cp.spawnSync(process.execPath,[path.join(__dirname,"s08-verify-partial-export.cjs"),base],{encoding:"utf8",maxBuffer:1024*1024});
 if(verify.error||verify.status!==0)fail("Intégrité de l'export refusée : "+(verify.stderr||verify.error?.message||"erreur inconnue").slice(0,1500));
 const raw=read("garage-data.json"),hash=crypto.createHash("sha256").update(raw).digest("hex");
 // Une seule table de quarantaine, aucun INSERT dans les tables applicatives.
 const hex=raw.toString("hex"),sha=hash;
 const sql=[
  "\\set ON_ERROR_STOP on",
  "BEGIN;",
  "CREATE SCHEMA IF NOT EXISTS s08_quarantine;",
  "CREATE TABLE IF NOT EXISTS s08_quarantine.snapshots (sha256 text PRIMARY KEY, imported_at timestamptz NOT NULL DEFAULT now(), source text NOT NULL, payload jsonb NOT NULL);",
  "INSERT INTO s08_quarantine.snapshots(sha256,source,payload) VALUES ('"+sha+"','TEST PARTIAL',convert_from(decode('"+hex+"','hex'),'UTF8')::jsonb) ON CONFLICT(sha256) DO NOTHING;",
  "COMMIT;",
  "SELECT sha256,source,jsonb_array_length(payload->'quotes') AS quotes FROM s08_quarantine.snapshots WHERE sha256='"+sha+"';"
 ].join("\n");
 // Connexion UNIQUEMENT à la base locale fixe ; aucun hôte distant.
 const run=cp.spawnSync("sudo",["-n","/bin/bash","-c","exec runuser -u postgres -- psql -X -h /var/run/postgresql -v ON_ERROR_STOP=1 -d atelier_s08_restore"],{input:sql,encoding:"utf8",maxBuffer:2*1024*1024});
 if(run.error)fail(run.error.message);
 if(run.status!==0)fail("Échec PostgreSQL local : "+(run.stderr||"").slice(0,2000));
 console.log(run.stdout);
 console.log("S08_STAGING_OK : export partiel vérifié, JSON placé en quarantaine locale. AUCUNE restauration applicative.");
}catch(e){console.error("S08_STAGING_REFUSED : "+e.message);process.exitCode=1}
