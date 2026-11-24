#!/usr/bin/env node
"use strict";
/* Build ONE transaction for the Storage cutover from legacy public bucket
 * to private multi-tenant Storage. Generates SQL only, NEVER executes.
 * Keeps the previously tested tenant policy as the sole canonical source.
 */
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"s10-storage-tenant-isolation-candidate-NOT-EXECUTED.sql"),"utf8");
const prefix=source.indexOf("BEGIN;");
const suffix=source.lastIndexOf("COMMIT;");
if(prefix<0||suffix<0||suffix<=prefix||
   (source.match(/\bBEGIN\s*;/g)||[]).length!==1||
   (source.match(/\bCOMMIT\s*;/g)||[]).length!==1)
 throw Error("Storage policy transaction boundaries changed: manual review required");
const body=source.slice(prefix+"BEGIN;".length,suffix).trim();
if(!body.includes("S10 files read tenant")||
   !body.includes("S10 files insert own prefix")||
   !body.includes("GRANT EXECUTE ON FUNCTION public.can_read_garage_file"))
 throw Error("Expected canonical storage policies are missing");
const sql=`-- S10 SINGLE ATOMIC STORAGE CUTOVER -- NOT EXECUTED / NO-GO.
-- Owner approval, fresh physical backup and browser sign-off REQUIRED.
-- Run AFTER complete multi-garage schema migration with verified owner mapping.
-- This flips only the wo-files bucket public flag, not file bytes or paths.
\\set ON_ERROR_STOP on
BEGIN;
DO $preflight$
DECLARE n bigint;
BEGIN
 IF to_regclass('public.garage_members') IS NULL OR
    to_regclass('public.garage_data') IS NULL OR
    to_regprocedure('public.can_read_garage_file(uuid)') IS NULL
 THEN RAISE EXCEPTION 'REFUSED: multi-garage schema and membership helper required'; END IF;
 IF (SELECT public FROM storage.buckets WHERE id='wo-files') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'REFUSED: expected exactly one legacy public wo-files bucket'; END IF;
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='wo-files';
 IF n<>55 THEN RAISE EXCEPTION 'REFUSED: expected 55 historical file objects; got %',n; END IF;
 IF EXISTS (SELECT 1 FROM storage.objects
            WHERE bucket_id='wo-files' AND split_part(name,'/',1)<>'clients')
 THEN RAISE EXCEPTION 'REFUSED: unexpected historical path prefix'; END IF;
 IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='wo-files'
            AND (owner_id IS NULL OR owner_id NOT IN
               (SELECT user_id::text FROM public.garage_members
                WHERE role IN ('owner','employee'))))
 THEN RAISE EXCEPTION 'REFUSED: file owners cannot be mapped to garage'; END IF;
 IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage'
    AND tablename='objects' AND policyname NOT IN (
     'Allow authenticated delete 12vdd8i_0',
     'Allow authenticated delete 12vdd8i_1',
     'Allow authenticated read 12vdd8i_0',
     'Allow authenticated upload 12vdd8i_0'))
 THEN RAISE EXCEPTION 'REFUSED: unexpected Storage policies'; END IF;
END $preflight$;
-- No intermediate commit: row visibility and RLS policy changes publish together.
UPDATE storage.buckets SET public=false WHERE id='wo-files' AND public=true;
DO $assert_private$
BEGIN
 IF (SELECT public FROM storage.buckets WHERE id='wo-files') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Bucket flip failed'; END IF;
END $assert_private$;

${body}
DO $postflight$
BEGIN
 IF (SELECT public FROM storage.buckets WHERE id='wo-files') IS DISTINCT FROM false
  OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')<>55
  OR (SELECT count(*) FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects')<>2
  OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
     AND policyname NOT IN ('S10 files read tenant','S10 files insert own prefix'))
 THEN RAISE EXCEPTION 'Storage postflight failed: ROLLBACK'; END IF;
END $postflight$;
COMMIT;
`;
const out=process.argv[2];
if(!out)throw Error("Usage: node audit/s10-build-atomic-storage-cutover.cjs <output.sql>");
if(fs.existsSync(out))throw Error("REFUSED: will not overwrite a previously generated cutover");
fs.writeFileSync(out,sql,{flag:"wx"});
console.log("S10_ATOMIC_STORAGE_CUTOVER_GENERATED_NOT_EXECUTED");
