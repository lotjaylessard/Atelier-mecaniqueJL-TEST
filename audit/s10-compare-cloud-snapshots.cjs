#!/usr/bin/env node
/* S10 - détecte les différences entre code source GitHub et snapshots
 * récupérés des fonctions réellement actives dans Supabase TEST.
 * Aucune connexion réseau et aucune écriture. */
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(process.argv[2]||".");
const files=[
 "garage-calendar-oauth/index.ts",
 "garage-familywall-calendar/index.ts",
 "garage-familywall-calendar/ics.js"
];
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const details=files.map(file=>{
 const source=path.join(root,"supabase/functions",file);
 const active=path.join(root,"audit/s10-cloud-reference",file);
 const a=fs.readFileSync(source),b=fs.readFileSync(active);
 return {file,sourceSha256:sha(a),activeSnapshotSha256:sha(b),matches:a.equals(b)};
});
console.log(JSON.stringify({status:details.every(x=>x.matches)?"PARITY":"DRIFT_REVIEW_REQUIRED",details,note:"Les snapshots reflètent la récupération du 23 novembre 2026; ce test ne vérifie pas les changements cloud ultérieurs."},null,2));
