-- S10 PRE-FLIGHT READ ONLY. Run against PROD BEFORE migration, never modifies data.
-- No personal client data or secrets in results.
WITH current_state AS (
 SELECT
  (SELECT count(*) FROM public.garage_data) AS garage_data_rows,
  (SELECT count(*) FROM public.garage_data gd JOIN auth.users u ON u.id=gd.user_id) AS valid_owner_rows,
  (SELECT count(*) FROM public.garage_data WHERE data IS NOT NULL) AS nonnull_json_rows,
  to_regclass('public.garages') IS NOT NULL AS already_has_garages,
  to_regclass('public.garage_members') IS NOT NULL AS already_has_members,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='garage_data' AND column_name='garage_id') AS already_has_garage_id,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='garage_data') AS existing_garage_data_policies,
  (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files') AS existing_wo_files
)
SELECT *, 
 (garage_data_rows=1 AND valid_owner_rows=1 AND nonnull_json_rows=1
  AND NOT already_has_garages AND NOT already_has_members AND NOT already_has_garage_id) AS schema_preconditions_pass
FROM current_state;

-- Inspect existing garage_data RLS (do not replace owner policies blindly).
SELECT policyname,cmd,roles,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename='garage_data'
ORDER BY policyname;

-- Inspect storage bucket settings, not storage object paths.
SELECT id,public,file_size_limit,allowed_mime_types
FROM storage.buckets WHERE id='wo-files';
