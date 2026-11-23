#!/usr/bin/env node
/* S10: vérifie que le candidat PROD ne conserve pas le stockage isolé de TEST.
 * Aucun accès réseau ni écriture. */
"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=process.argv[2];
if(!root){console.error("Usage: node audit/s10-check-storage-compat.cjs <dossier-candidat>");process.exit(2)}
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const errors=[];
if(/const\s+TEST_STORAGE_PREFIX\s*=/.test(index))errors.push("TEST_STORAGE_PREFIX présent dans le candidat PROD");
if(/MIGRATION DES ANCIENNES CLES DESACTIVEE EN TEST/.test(index))errors.push("Migration des anciennes clés explicitement désactivée");
if(/Ne jamais lire, migrer ou effacer les anciennes cles de production/.test(index))errors.push("Mode isolation TEST encore présent");
const expected=["invoices_v2","settings_v1","invoice_counter_v1","clients_v1","parts_inventory_v1","services_v1","notes_v1","links_v1","workorders_v1"];
for(const suffix of expected)if(!index.includes(suffix))errors.push("Clé locale attendue absente: "+suffix);
console.log(JSON.stringify({result:errors.length?"NO_GO":"STORAGE_STATIC_OK",errors,
 warning:"Même si ce contrôle passe, il faut tester l'hydratation de la base PROD, le comportement hors ligne, le cache navigateur et les conflits de données avant publication."},null,2));
if(errors.length)process.exitCode=1;
