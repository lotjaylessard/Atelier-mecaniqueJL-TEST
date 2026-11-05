"use strict";
/* S06-F02 : garde-fous statiques, aucune connexion a une base reelle. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const sql=fs.readFileSync("audit/S06-F02-proposition-timer-TEST-NE-PAS-EXECUTER.sql","utf8");
const plan=fs.readFileSync("audit/S06-plan-minuterie.md","utf8");
const required=[
  [/NE PAS EXECUTER/i,"migr. explicitement non executee"],
  [/CREATE TABLE IF NOT EXISTS public\.garage_timer_sessions/,"table independante"],
  [/REFERENCES auth\.users\(id\)/,"utilisateur authentifie"],
  [/CHECK \(status IN \('paused', 'running', 'posted'\)\)/,"etats permis"],
  [/CHECK \(confirmed_ms >= 0/,"duree non negative"],
  [/UNIQUE INDEX IF NOT EXISTS s06_timer_one_running_per_user[\s\S]*?WHERE status='running'/,"une minuterie par utilisateur"],
  [/ENABLE ROW LEVEL SECURITY/,"RLS active"],
  [/FORCE ROW LEVEL SECURITY/,"RLS force"],
  [/GRANT SELECT ON public\.garage_timer_sessions TO authenticated/,"lecture"],
  [/REVOKE ALL ON TABLE public\.garage_timer_sessions FROM PUBLIC, anon, authenticated/,"aucune ecriture directe"],
  [/user_id = \(select auth\.uid\(\)\)/,"lecture par proprietaire"],
  [/SECURITY DEFINER/,"RPC privilegee"],
  [/SET search_path = ''/,"search_path fixe"],
  [/v_uid uuid := auth\.uid\(\)/,"auth.uid sur RPC"],
  [/WHERE id=p_id AND user_id=v_uid FOR UPDATE/,"ligne proprietaire verrouillee"],
  [/pg_advisory_xact_lock/,"actions par compte serialisees"],
  [/v_rec\.revision <> p_expected_revision/,"revision attendue"],
  [/t\.revision=p_expected_revision/,"CAS atomique"],
  [/v_delta <= 20000/,"delai heartbeat limite"],
  [/v_rec\.status := 'paused'[\s\S]*?v_rec\.last_heartbeat_at := NULL/,"pause serveur"],
  [/GRANT EXECUTE ON FUNCTION public\.s06_timer_transition/,"RPC seulement compte connecte"],
  [/p_action NOT IN \('create','start','heartbeat','pause','recover'\)/,"actions limitees"],
  [/Le BT est immuable/,"BT non transferable"],
  [/Aucun transfert de main d.oeuvre/,"pas de facturation"]];
for(const [regex,label] of required)assert.match(sql,regex,label);
assert.ok(!/\b(?:DELETE|TRUNCATE|DROP TABLE)\s+public\.garage_data\b/i.test(sql),"garage_data inchange");
assert.ok(!/\b(?:ALTER TABLE|UPDATE|INSERT INTO)\s+public\.garage_data\b/i.test(sql),"pas de mutation garage_data");
assert.match(plan,/S06-F02/);
console.log("S06-F02 : "+required.length+" garde-fous statiques et isolation du stockage verifies.");
console.log("IMPORTANT : pas de RLS, RPC ou CAS TESTES contre Supabase reel. Migration non executee.");
