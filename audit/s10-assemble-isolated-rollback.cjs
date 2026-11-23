#!/usr/bin/env node
/* S10: assemble un essai SQL transactionnel, ROLLBACK obligatoire.
 * Jamais destiné à être exécuté sur la production.
 * Entrée: snapshots GitHub de TEST, sans données métier. */
"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname);
const draft=fs.readFileSync(path.join(root,"s10-schema-draft-NO-GO.sql"),"utf8");
const read=name=>JSON.parse(fs.readFileSync(path.join(root,"s10-test-"+name+"-snapshot.json"),"utf8")).items;
const constraints=read("constraints"),indexes=read("indexes"),policies=read("policies");
const functions=JSON.parse(fs.readFileSync(path.join(root,"s10-test-rpc-functions-snapshot.json"),"utf8")).functions;
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const out=[];
out.push("-- S10 TEST TRANSACTIONNEL SEULEMENT. NE PAS EXECUTER SUR PROD.");
out.push("-- Exécuter uniquement dans une restauration ISOLÉE et jetable de PROD.");
out.push("-- Ce script ne réconcilie PAS les politiques RLS héritées ni les droits Auth/Storage.");
out.push("-- Il n'est PAS une migration de production. ROLLBACK INCONDITIONNEL.");
out.push(draft.replace(/^BEGIN;\s*/m,"").replace(/\s*-- STOP:[\s\S]*$/,"").trim());
out.push("-- Contraintes TEST. Les contraintes existantes PROD sur garage_data.user_id sont conservées.");
out.push("-- PROD conserve ON DELETE CASCADE sur garage_data.user_id; TEST utilise RESTRICT : divergence à arbitrer.");
for(const x of constraints){
 if(x.table_name==="garage_data"&&["garage_data_pkey","garage_data_user_id_fkey"].includes(x.name))continue;
 out.push("ALTER TABLE public."+quote(x.table_name)+" ADD CONSTRAINT "+quote(x.name)+" "+x.definition+";");
}
out.push("-- Index secondaires seulement : les index de PK/UNIQUE sont créés par les contraintes.");
for(const x of indexes){
 if(constraints.some(c=>c.table_name===x.tablename&&["p","u"].includes(c.type)&&x.indexname===c.name))continue;
 if(x.indexname.endsWith("_pkey"))continue;
 out.push(x.indexdef+";");
}
out.push("-- Fonctions SQL réellement présentes dans TEST (sans données métier).");
for(const f of functions)out.push(f.definition.trimEnd().replace(/;?\s*$/,";"));
out.push("-- Triggers TEST: fonctions définies ci-dessus.");
out.push("CREATE TRIGGER protect_garage_data_ids_trigger BEFORE UPDATE ON public.garage_data FOR EACH ROW EXECUTE FUNCTION public.protect_garage_data_ids();");
out.push("CREATE TRIGGER s08_assign_quote_tracking_number_before_insert BEFORE INSERT ON public.garage_quotes FOR EACH ROW EXECUTE FUNCTION public.s08_assign_quote_tracking_number();");
out.push("CREATE TRIGGER s09_quote_identity_immutable BEFORE UPDATE ON public.garage_quotes FOR EACH ROW EXECUTE FUNCTION public.s09_protect_quote_identity();");
out.push("-- RLS: les anciennes policies PROD peuvent coexister et ouvrir des accès inattendus.");
out.push("-- Ne PAS déployer ces policies sans suppression/revue transactionnelle des anciennes règles.");
for(const x of policies){
 const roles=x.roles.slice(1,-1).split(",").map(r=>r.trim()).join(", ");
 const cmd=x.cmd==="ALL"?"ALL":x.cmd;
 out.push("CREATE POLICY "+quote(x.policyname)+" ON public."+quote(x.tablename)+" FOR "+cmd+" TO "+roles+(x.qual?" USING ("+x.qual+")":"")+(x.with_check?" WITH CHECK ("+x.with_check+")":"")+";");
}
out.push("-- Aucun COMMIT n'est permis. Les tests de restauration doivent être exécutés séparément.");
out.push("ROLLBACK;");
const sql="BEGIN;\n\n"+out.join("\n\n")+"\n";
if(/\bCOMMIT\s*;/i.test(sql)||!sql.trimEnd().endsWith("ROLLBACK;"))throw Error("Unsafe transaction");
const target=process.argv[2];
if(target)fs.writeFileSync(target,sql);else process.stdout.write(sql);
