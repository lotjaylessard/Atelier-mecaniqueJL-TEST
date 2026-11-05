"use strict";
// Controle structurel du BROUILLON SQL, sans execution PostgreSQL.
// Ne valide ni la syntaxe PL/pgSQL reelle, ni RLS, ni les permissions serveur.
const fs=require("node:fs");
const assert=require("node:assert/strict");
const sql=fs.readFileSync("audit/S06-F05-posting-atomique-PROPOSITION-NE-PAS-EXECUTER.sql","utf8");
const checks=[
  [/NE PAS EXECUTER/,"brouillon non deploye"],
  [/CREATE FUNCTION public\.s06_timer_post_labor\(/,"RPC proposee"],
  [/RETURNS jsonb[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/,"fonction avec chemin verrouille"],
  [/v_uid uuid := auth\.uid\(\)/,"utilisateur authentifie serveur"],
  [/pg_catalog\.pg_advisory_xact_lock/,"verrou utilisateur"],
  [/WHERE id=p_session_id AND user_id=v_uid[\s\S]*?FOR UPDATE/,"verrou session et proprietaire"],
  [/v_session\.revision<>p_expected_revision/,"revision de session"],
  [/v_session\.status<>'paused'/,"pause obligatoire"],
  [/v_session\.posted_labor_id IS NOT NULL/,"transfert deja fait refuse"],
  [/gm\.user_id=v_uid AND gm\.garage_id=v_session\.garage_id/,"appartenance garage"],
  [/WHERE gd\.garage_id=v_session\.garage_id[\s\S]*?FOR UPDATE/,"verrou snapshot"],
  [/v_garage_version IS DISTINCT FROM p_expected_garage_version/,"revision du snapshot"],
  [/jsonb_typeof\(v_snapshot->'workorders'\)<>'array'/,"BT valide"],
  [/jsonb_typeof\(v_snapshot->'invoices'\)<>'array'/,"factures valides"],
  [/v_wo->>'status'<>'en_cours'/,"statut en cours"],
  [/i\.value->>'workOrderNumber'=v_wo_number/,"facture liee refusee"],
  [/l\.value->>'timerSessionId'=v_session\.id::text/,"ligne dupliquee interdite"],
  [/pg_catalog\.strpos\(v_notes,v_marker\)>0/,"note dupliquee interdite"],
  [/pg_catalog\.btrim\(p_description\)/,"description obligatoire"],
  [/pg_catalog\.round\(v_session\.confirmed_ms::numeric \/ 3600000,2\)/,"heures decimales"],
  [/pg_catalog\.round\(v_hours\*v_rate,2\)/,"total arrondi"],
  [/Compte auteur : /,"auteur compte serveur"],
  [/v_wo:=pg_catalog\.jsonb_set\(v_wo,'\{labor\}'/,"ligne ajoutee"],
  [/v_wo:=pg_catalog\.jsonb_set\(v_wo,'\{notes\}'/,"note ajoutee"],
  [/UPDATE public\.garage_data[\s\S]*?WHERE garage_id=v_session\.garage_id AND version=v_garage_version/,"CAS garage"],
  [/UPDATE public\.garage_timer_sessions[\s\S]*?AND revision=v_session\.revision/,"CAS session"],
  [/SET status='posted', posted_labor_id=v_session\.id::text/,"marquage traite"],
  [/GET DIAGNOSTICS v_written=ROW_COUNT/,"confirmation resultat ecrit"],
  [/REVOKE ALL ON FUNCTION public\.s06_timer_post_labor/,"permissions explicites"],
  [/GRANT EXECUTE ON FUNCTION public\.s06_timer_post_labor[\s\S]*?TO authenticated/,"roles connectes"]
];
for(const [regex,name] of checks)assert.match(sql,regex,name);
assert.equal((sql.match(/\bCREATE FUNCTION\b/g)||[]).length,1);
assert.equal((sql.match(/\bBEGIN;/g)||[]).length,1);
assert.equal((sql.match(/\bCOMMIT;/g)||[]).length,1);
assert.equal((sql.match(/\$s06\$/g)||[]).length,2);
assert.equal((sql.match(/\bUPDATE public\.garage_data\b/g)||[]).length,1);
assert.equal((sql.match(/\bUPDATE public\.garage_timer_sessions\b/g)||[]).length,1);
const lockSession=sql.indexOf("WHERE id=p_session_id AND user_id=v_uid");
const lockGarage=sql.indexOf("WHERE gd.garage_id=v_session.garage_id");
const writeGarage=sql.indexOf("UPDATE public.garage_data");
const writeSession=sql.indexOf("UPDATE public.garage_timer_sessions");
assert.ok(lockSession>=0&&lockGarage>lockSession&&writeGarage>lockGarage&&writeSession>writeGarage,"Ordre de verrous et ecritures");
for(const forbidden of [/\bUPDATE public\.garage_members\b/i,/\bDELETE FROM\b/i,/\bUPDATE public\.invoices\b/i,/\bINSERT INTO public\.garage_data\b/i,/p_actor_name/i,/p_confirmed_at/i,/\bCREATE TABLE\b/i])
 assert.doesNotMatch(sql,forbidden,"Aucune autre mutation ni identite fournie par client");
console.log("S06-F05 : "+checks.length+" protections structurelles du brouillon SQL — OK. PAS un test SQL reel.");
