#!/usr/bin/env node
"use strict";
/* S10 local continuation: extracts ONLY phases 5-10 from the full, versioned
 * candidate. Designed for a disposable CLONE of an existing phase-1-to-4 restore.
 * This script generates SQL; it never invokes psql or touches Supabase.
 */
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"s10-prod-complete-migration-candidate-NOT-EXECUTED.sql"),"utf8");
const marker="-- ===== s10-phase5-supabase-helper-timer-functions.sql =====";
const idx=source.indexOf(marker);
if(idx<0||source.indexOf(marker,idx+1)>=0)throw Error("Missing/duplicate phase-5 boundary");
const rest=source.slice(idx).trim();
if(!rest.endsWith("COMMIT;")||rest.split(/\bCOMMIT\s*;/gi).length!==2)throw Error("Unexpected commit count");
if(!rest.includes("Garage members read active garage data")||
   !rest.includes("REVOKE ALL ON TABLE public.garage_data")||
   !rest.includes("s10_finalize_bt_invoice_owner_candidate")||
   !rest.includes("DROP POLICY \"Allow authenticated users\""))
 throw Error("Expected verified security/migration phase missing");
const sql=`-- S10 continuation on a THROWAWAY LOCAL COPY ONLY. NEVER PROD/TEST.
-- Preconditions: the source local restore already has phases 1-4 COMMITTED.
-- All SQL runs atomically; if a guard fails the transaction rolls back.
\\set ON_ERROR_STOP on
BEGIN;
DO $s10_local_clone_guard$
BEGIN
 IF current_database()<>'atelier_jl_s10_continuation' OR
    (inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN (inet '127.0.0.1', inet '::1')) OR
    (SELECT count(*) FROM public.garage_data)<>1 OR
    (SELECT count(*) FROM auth.users)<>1 OR
    (SELECT count(*) FROM public.garage_members WHERE role='owner')<>1 OR
    (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')<>55 OR
    to_regclass('public.garage_quotes') IS NULL OR
    to_regclass('public.garage_external_calendar_connections') IS NULL OR
    to_regprocedure('public.s06_timer_transition(uuid,text,bigint,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'REFUSED: requires untouched local clone after phases 1-4'; END IF;
END $s10_local_clone_guard$;

${rest}
`;
const out=process.argv[2];
if(!out)throw Error("Usage: node audit/s10-generate-local-phase5-to-10.cjs <new-output-sql>");
if(fs.existsSync(out))throw Error("Refusing to overwrite previously generated SQL");
fs.writeFileSync(out,sql,{flag:"wx"});
console.log("S10_LOCAL_PHASE5_TO10_SQL_GENERATED_NOT_EXECUTED");
