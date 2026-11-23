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

-- S10 Storage safety snapshot: metadata only. Read-only; no client identifiers,
-- object paths, file contents or personal records are returned.
WITH bt_attachments AS (
 SELECT a.value->>'path' AS object_path
 FROM public.garage_data gd
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(gd.data->'workorders')='array'
   THEN gd.data->'workorders' ELSE '[]'::jsonb END) wo(value)
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(wo.value->'attachments')='array'
   THEN wo.value->'attachments' ELSE '[]'::jsonb END) a(value)
), snapshot AS (
 SELECT
   (SELECT count(*) FROM bt_attachments) AS referenced_attachments,
   (SELECT count(*) FROM bt_attachments WHERE NULLIF(object_path,'') IS NULL) AS missing_paths,
   (SELECT count(*) FROM bt_attachments a WHERE NOT EXISTS (
      SELECT 1 FROM storage.objects o WHERE o.bucket_id='wo-files' AND o.name=a.object_path
   )) AS absent_storage_objects,
   (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='wo-files'
     AND NOT EXISTS(SELECT 1 FROM bt_attachments a WHERE a.object_path=o.name)
   ) AS unreferenced_storage_objects,
   (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='wo-files'
      AND split_part(o.name,'/',1)<>'clients') AS unexpected_legacy_prefixes,
   (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='wo-files'
      AND NOT EXISTS(SELECT 1 FROM public.garage_data gd
                     WHERE gd.user_id::text=o.owner_id)) AS unknown_legacy_owners,
   (SELECT count(*) FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects'
       AND policyname NOT IN (
          'Allow authenticated delete 12vdd8i_0',
          'Allow authenticated delete 12vdd8i_1',
          'Allow authenticated read 12vdd8i_0',
          'Allow authenticated upload 12vdd8i_0'
       )) AS unreviewed_storage_policies
)
SELECT *,
  (missing_paths=0 AND absent_storage_objects=0
    AND unexpected_legacy_prefixes=0 AND unknown_legacy_owners=0
    AND unreviewed_storage_policies=0) AS storage_preconditions_pass
FROM snapshot;
