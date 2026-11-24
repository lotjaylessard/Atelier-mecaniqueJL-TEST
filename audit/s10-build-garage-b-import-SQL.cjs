#!/usr/bin/env node
"use strict";
/*
 * S10: build a PRIVATE / OFFLINE review-only SQL import for garage B.
 * NEVER executes a query, accesses Supabase, or deploys.
 * Usage: node audit/s10-build-garage-b-import-SQL.cjs <two-garage-plan.json> <new-import.sql>
 * Only run against the user's own securely held final freeze snapshot.
 * NEVER commit generated SQL: it embeds all confidential friend customer data.
 * Prerequisite: S10 initial schema migration AND garage B owner provisioned,
 * with the exact garage B ID and destination Auth UID from the destination.
 * Physical Storage upload/checksums must precede making the site available.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {planTwoGarages}=require("./s10-plan-two-garage-merge.cjs");
const required=["clients","workorders","invoices","notes","parts","services"];
const refuse=m=>{throw Error("S10_FRIEND_IMPORT_REFUSED: "+m)};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function makeSql(input) {
 const prepared=planTwoGarages(input);
 if(prepared.rows.length!==2||prepared.rows[0].user_id===prepared.rows[1].user_id)
   refuse("independent garages required");
 const A=prepared.rows[0],B=prepared.rows[1];
 if(!uuid.test(A.garage_id)||!uuid.test(B.garage_id)||!uuid.test(B.user_id))refuse("invalid IDs");
 if(B.data?.workorders?.length!==prepared.counts.garageB.workorders)refuse("invalid friend BT count");
 const json=JSON.stringify(B.data);
 if(!json||json.length<50)refuse("friend data missing");
 const hex=Buffer.from(json,"utf8").toString("hex");
 // Prevent false sense of completeness. This statement inserts database JSON only.
 const checks=required.map(k=>`   IF jsonb_array_length(v_payload->'${k}') <> ${prepared.counts.garageB[k]} THEN
     RAISE EXCEPTION 'STOP: friend ${k} changed'; END IF;`).join("\n");
 const sql=`-- GENERATED PRIVATE / DO NOT COMMIT OR SHARE
-- S10 garage B real-data import CANDIDATE, NOT EXECUTED; contains customer records!
-- Requires separately approved maintenance window, final source snapshots and backups.
-- Before running: upload 19 physical Storage files to private destination and verify SHA256.
-- Friend path remapping already applied to JSON by the offline plan.
-- Never execute on TEST or on the friend's original source project.
BEGIN;
DO $s10_friend_import$
DECLARE
 v_owner_a uuid := '${A.user_id}';
 v_garage_a uuid := '${A.garage_id}';
 v_owner_b uuid := '${B.user_id}';
 v_garage_b uuid := '${B.garage_id}';
 v_payload jsonb := convert_from(decode('${hex}','hex'),'UTF8')::jsonb;
 v_old_a jsonb;
BEGIN
 IF current_database() <> 'postgres' THEN
   RAISE EXCEPTION 'STOP: expected Supabase destination postgres database';
 END IF;
 IF v_owner_a=v_owner_b OR v_garage_a=v_garage_b THEN
   RAISE EXCEPTION 'STOP: owner/garage collision';
 END IF;
 IF (SELECT count(*) FROM public.garages)<>2 OR
    (SELECT count(*) FROM public.garage_members WHERE role='owner')<>2 OR
    (SELECT count(*) FROM public.garage_data)<>1 THEN
   RAISE EXCEPTION 'STOP: need exactly two garages, two owners, only A data pre-import';
 END IF;
 SELECT data INTO v_old_a FROM public.garage_data
 WHERE user_id=v_owner_a AND garage_id=v_garage_a;
 IF v_old_a IS NULL THEN RAISE EXCEPTION 'STOP: original garage A data mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.garage_members
   WHERE garage_id=v_garage_a AND user_id=v_owner_a AND role='owner') OR
    NOT EXISTS(SELECT 1 FROM public.garage_members
   WHERE garage_id=v_garage_b AND user_id=v_owner_b AND role='owner') OR
    NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_owner_b) OR
    EXISTS(SELECT 1 FROM public.garage_members
      WHERE (user_id=v_owner_a AND garage_id<>v_garage_a)
         OR (user_id=v_owner_b AND garage_id<>v_garage_b)) THEN
   RAISE EXCEPTION 'STOP: owner/membership isolation invalid';
 END IF;
 IF EXISTS(SELECT 1 FROM public.garage_data WHERE user_id=v_owner_b OR garage_id=v_garage_b) THEN
   RAISE EXCEPTION 'STOP: Garage B already contains data';
 END IF;
${checks}
 INSERT INTO public.garage_data(user_id,garage_id,data)
 VALUES(v_owner_b,v_garage_b,v_payload);
 IF (SELECT count(*) FROM public.garage_data)<>2 OR
    (SELECT count(*) FROM public.garage_data WHERE user_id=v_owner_b AND garage_id=v_garage_b)<>1 OR
    (SELECT data FROM public.garage_data WHERE user_id=v_owner_a AND garage_id=v_garage_a) IS DISTINCT FROM v_old_a THEN
   RAISE EXCEPTION 'STOP: post-import isolation/data invariant';
 END IF;
 RAISE NOTICE 'Garage B JSON imported; verify physical Storage and Auth sessions before publishing';
END $s10_friend_import$;
COMMIT;
`;
 return {sql,counts:prepared.counts.garageB};
}
if(require.main===module){
 try{
  const [source,dest]=process.argv.slice(2);
  if(!source||!dest)refuse("usage: input.json NEW-output.sql");
  const input=path.resolve(source),output=path.resolve(dest);
  if(input===output||fs.existsSync(output))refuse("output must be new");
  const result=makeSql(JSON.parse(fs.readFileSync(input,"utf8")));
  fs.writeFileSync(output,result.sql,{flag:"wx",mode:0o600});
  console.log("S10_GARAGE_B_SQL_PREPARED_OFFLINE_NOT_EXECUTED "+JSON.stringify(result.counts));
 }catch(e){console.error(String(e.message||e));process.exitCode=1}
}
module.exports={makeSql};
