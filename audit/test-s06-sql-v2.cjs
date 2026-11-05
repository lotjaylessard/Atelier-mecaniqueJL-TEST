"use strict";
// S06 — V2 : audit statique du projet de migration, aucune BD requise.
// Ne remplace pas les essais SQL / RLS a deux comptes distincts.
const fs=require("node:fs");
const assert=require("node:assert/strict");
const source=fs.readFileSync("audit/S06-F02-V2-BT-verification-NE-PAS-EXECUTER.sql","utf8");
const checks=[
 [/NE PAS EXECUTER/,"migration non active"],
 [/CREATE TABLE public\.garage_timer_sessions/,"table independante"],
 [/user_id uuid NOT NULL REFERENCES auth\.users/,"lien compte"],
 [/garage_id uuid NOT NULL/,"lien garage"],
 [/work_order_id text NOT NULL/,"identifiant BT"],
 [/CREATE UNIQUE INDEX s06_timer_one_running_per_user[\s\S]*?WHERE status='running'/,"une session active par utilisateur"],
 [/ENABLE ROW LEVEL SECURITY/,"RLS"],
 [/FORCE ROW LEVEL SECURITY/,"RLS force"],
 [/GRANT SELECT ON public\.garage_timer_sessions TO authenticated/,"lecture seule API"],
 [/CREATE POLICY s06_timer_select_own[\s\S]*?user_id = \(select auth\.uid\(\)\)/,"lecture par compte"],
 [/REVOKE ALL ON public\.garage_timer_sessions FROM PUBLIC, anon, authenticated/,"pas de mutation directe"],
 [/CREATE FUNCTION public\.s06_timer_check_work_order/,"verification BT serveur"],
 [/gm\.user_id=p_uid AND gm\.garage_id=p_garage_id/,"appartenance"],
 [/p_uid IS DISTINCT FROM auth\.uid\(\)/,"auth contre usurpation"],
 [/gd\.garage_id=p_garage_id/,"snapshot garage"],
 [/LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''/,"lecture fraiche"],
 [/FROM public\.garage_data gd WHERE gd\.garage_id=p_garage_id FOR SHARE/,"verrou partage concurrent"],
 [/jsonb_typeof\(v_snapshot->'workorders'\)<>'array'/,"schema BT"],
 [/jsonb_typeof\(v_snapshot->'invoices'\)<>'array'/,"schema facture"],
 [/wo\.value->>'id'=p_work_order_id/,"identite BT"],
 [/v_wo->>'status'<>'en_cours'/,"statut actif uniquement"],
 [/wo\.value->>'number'=v_number/,"numero BT unique"],
 [/inv\.value->>'workOrderNumber'=v_number/,"facture liee refusee"],
 [/REVOKE ALL ON FUNCTION public\.s06_timer_check_work_order/,"helper privee"],
 [/SECURITY DEFINER SET search_path = ''/,"chemin fixe"],
 [/pg_catalog\.pg_advisory_xact_lock/,"verrou utilisateur"],
 [/p_expected_revision/,"revisions CAS"],
 [/x\.revision=p_expected_revision/,"CAS sur sauvegarde"],
 [/v_delta>20000/,"heartbeat limite"],
 [/interval '60 seconds'/,"reprise apres fermeture"],
 [/IF v_rec\.status='posted'/,"termine non modifiable"],
 [/p_action NOT IN \('create','start','heartbeat','pause','recover'\)/,"aucune facturation en RPC"],
 [/GRANT EXECUTE ON FUNCTION public\.s06_timer_transition[\s\S]*?TO authenticated/,"execution avec connexion"]
];
for(const [regex,description] of checks)assert.match(source,regex,description);
assert.equal((source.match(/\bBEGIN;/g)||[]).length,1);
assert.equal((source.match(/\bCOMMIT;/g)||[]).length,1);
assert.equal((source.match(/\$\$/g)||[]).length,4,"Deux fonctions delimitees");
for(const forbidden of [/\bUPDATE\s+public\.garage_data\b/i,/\bDELETE\s+FROM\s+public\.garage_data\b/i,/\bUPDATE\s+public\.garage_members\b/i,/\bUPDATE\s+public\.invoices\b/i])
 assert.doesNotMatch(source,forbidden,"Aucune mutation du garage");
assert.ok(!source.includes("CREATE TABLE IF NOT EXISTS"),"Refuser si deja installe pour eviter collision silencieuse");
console.log("S06 V2 : "+checks.length+" protections statiques validees. PAS de test SQL reel ni migration.");
