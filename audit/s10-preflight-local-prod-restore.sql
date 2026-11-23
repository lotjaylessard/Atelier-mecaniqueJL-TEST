-- S10 / PROD local restore — READ ONLY. PostgreSQL 17.
-- Run ONLY against atelier_jl_restore_test, never PROD or TEST.
-- Does not print client records, emails, names, or IDs.
\set ON_ERROR_STOP on
\echo === S10: isolated local copy preflight ===
SELECT current_database() AS database_name, current_setting('server_version') AS postgres_version;
SELECT CASE WHEN current_database() = 'atelier_jl_restore_test'
  THEN 'OK: isolated database'
  ELSE 'STOP: unexpected database' END AS target_check;
-- Abort if accidentally connected elsewhere.
SELECT 1 / CASE WHEN current_database() = 'atelier_jl_restore_test' THEN 1 ELSE 0 END AS isolated_only;
SELECT 'garage_data' AS entity, count(*) AS rows FROM public.garage_data
UNION ALL SELECT 'auth.users', count(*) FROM auth.users
UNION ALL SELECT 'storage.objects', count(*) FROM storage.objects
ORDER BY entity;
SELECT count(*) AS garage_rows_with_null_json FROM public.garage_data WHERE data IS NULL;
SELECT count(*) AS garage_rows_without_auth_user
FROM public.garage_data gd LEFT JOIN auth.users au ON au.id = gd.user_id
WHERE au.id IS NULL;
SELECT count(*) AS wo_files_metadata_rows FROM storage.objects WHERE bucket_id = 'wo-files';
SELECT column_name, data_type, is_nullable, coalesce(column_default,'(none)') AS default_expression
FROM information_schema.columns WHERE table_schema='public' AND table_name='garage_data'
ORDER BY ordinal_position;
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid = 'public.garage_data'::regclass ORDER BY conname;
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;
\echo === End of READ ONLY preflight ===
