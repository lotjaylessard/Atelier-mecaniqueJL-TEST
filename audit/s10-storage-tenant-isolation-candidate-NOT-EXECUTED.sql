-- S10 Storage isolation candidate v2: REVIEW ONLY; NOT EXECUTED.
-- Apply only in a planned cutover AFTER multi-garage schema/backfill, validated
-- attachment URL handling, verified private bucket and restore backup.
-- Existing PROD paths clients/... stay unchanged; new paths <auth.uid()>/clients/...
-- Never run on an active public bucket (public object downloads bypass RLS).

BEGIN;
DO $guard$
BEGIN
 IF (SELECT public FROM storage.buckets WHERE id='wo-files') IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'wo-files must be private before enabling isolation';
 END IF;
 IF to_regclass('public.garage_members') IS NULL
    OR to_regclass('public.garage_data') IS NULL THEN
   RAISE EXCEPTION 'Multi-garage schema not installed';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='garage_data'
                  AND column_name='garage_id') THEN
   RAISE EXCEPTION 'garage_data.garage_id is missing';
 END IF;
 -- The path scheme <user-id>/... is safe only when a user belongs to one garage.
 -- A future multi-membership feature must use <garage-id>/<user-id>/... instead.
 IF EXISTS (
   SELECT 1 FROM public.garage_members
   GROUP BY user_id HAVING count(DISTINCT garage_id)>1
 ) THEN
   RAISE EXCEPTION 'Users belonging to multiple garages require garage-scoped storage paths';
 END IF;
 -- Fail closed: unknown permissive policies are OR-combined by PostgreSQL.
 IF EXISTS (
   SELECT 1 FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname NOT IN (
       'Allow authenticated delete 12vdd8i_0',
       'Allow authenticated delete 12vdd8i_1',
       'Allow authenticated read 12vdd8i_0',
       'Allow authenticated upload 12vdd8i_0',
       'S10 files read tenant',
       'S10 files insert own prefix'
     )
 ) THEN
   RAISE EXCEPTION 'Unexpected storage.objects policy: review all policies before S10';
 END IF;
 IF EXISTS (
   SELECT 1 FROM storage.objects o
   WHERE o.bucket_id='wo-files' AND split_part(o.name,'/',1)='clients'
     AND (o.owner_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.garage_members m
       WHERE m.user_id::text=o.owner_id AND m.role IN ('owner','employee')
     ))
 ) THEN
   RAISE EXCEPTION 'Some legacy files have no owner/member mapping; resolve first';
 END IF;
END $guard$;

-- Remove legacy PROD policies. Review ALL other storage.objects policies:
-- PostgreSQL OR-combines permissive RLS policies, so another permissive policy
-- can still grant access. Do not activate until that review is complete.
DROP POLICY IF EXISTS "Allow authenticated delete 12vdd8i_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete 12vdd8i_1" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read 12vdd8i_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload 12vdd8i_0" ON storage.objects;
DROP POLICY IF EXISTS "S10 files read tenant" ON storage.objects;
DROP POLICY IF EXISTS "S10 files insert own prefix" ON storage.objects;

-- Legacy clients/... paths: read only by the *actual object's owner*
-- or a currently authorized member of that owner's garage. Crucially, do
-- NOT grant all garage users access merely because they have a garage_id.
-- New UUID-prefixed paths: owner or valid same-garage membership; match
-- storage owner_id to path prefix so a forged prefix cannot be used.
CREATE POLICY "S10 files read tenant" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id='wo-files' AND
  (
    (
      split_part(name,'/',1)='clients'
      AND owner_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.garage_data original_garage
        JOIN public.garage_members viewer
          ON viewer.garage_id=original_garage.garage_id
        WHERE original_garage.user_id::text=storage.objects.owner_id
          AND original_garage.garage_id IS NOT NULL
          AND viewer.user_id=(SELECT auth.uid())
          AND viewer.role IN ('owner','employee')
      )
    )
    OR (
      split_part(name,'/',1)=(SELECT auth.uid())::text
      AND owner_id=(SELECT auth.uid())::text
    )
    OR (
      owner_id=split_part(name,'/',1)
      AND EXISTS (
        SELECT 1 FROM public.garage_members file_owner
        JOIN public.garage_members viewer
          ON viewer.garage_id=file_owner.garage_id
        WHERE file_owner.user_id::text=split_part(storage.objects.name,'/',1)
          AND viewer.user_id=(SELECT auth.uid())
          AND file_owner.role IN ('owner','employee')
          AND viewer.role IN ('owner','employee')
      )
    )
  )
);
CREATE POLICY "S10 files insert own prefix" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='wo-files'
  AND split_part(name,'/',1)=(SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1 FROM public.garage_members m
    WHERE m.user_id=(SELECT auth.uid())
      AND m.role IN ('owner','employee')
  )
);
-- Intentionally no UPDATE / DELETE policy. Server-validated attachment
-- deletion workflow must be reviewed separately before enabling those.
COMMIT;
