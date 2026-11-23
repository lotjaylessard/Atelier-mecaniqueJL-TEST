#!/usr/bin/env node
/* S10: rapprochement statique des Edge Functions appelées par l'interface
 * avec les sources versionnées. Aucune écriture ni requête réseau. */
"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(process.argv[2]||".");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const regex=/https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/([a-z0-9-]+)/gi;
const names=[...new Set([...html.matchAll(regex)].map(x=>x[1]))].sort();
const missing=names.filter(name=>!fs.existsSync(path.join(root,"supabase","functions",name,"index.ts")));
const result={requiredEdgeFunctions:names,versionedSourceMissing:missing,
status:missing.length?"BLOCKED_MISSING_SOURCE":"SOURCES_PRESENT",
note:"Une fonction absente du dépôt peut exister en cloud; son code, sa configuration et sa compatibilité ne sont alors pas auditables à partir de ce dépôt. Vérifier les déploiements réels séparément."};
console.log(JSON.stringify(result,null,2));
if(missing.length)process.exitCode=1;
