-- S06 : DIAGNOSTIC EN LECTURE SEULE — Supabase TEST uniquement.
-- Aucune migration, CREATE, UPDATE, DELETE, EXECUTE de RPC ni alteration.
-- NE PAS EXECUTER sur production.
-- A utiliser UNE SEULE FOIS avant migration lorsque la sauvegarde TEST
-- recuperable a ete confirmee. Ce diagnostic ne constitue PAS une sauvegarde.
SELECT table_name,column_name,data_type,udt_name,is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('garage_data','garage_members','garage_timer_sessions')
ORDER BY table_name,ordinal_position;

SELECT n.nspname AS schema_name,c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls,
       pg_catalog.pg_get_userbyid(c.relowner) AS table_owner
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('garage_data','garage_members','garage_timer_sessions') AND c.relkind IN ('r','p')
ORDER BY c.relname;

SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_catalog.pg_policies
WHERE schemaname='public' AND tablename IN
 ('garage_data','garage_members','garage_timer_sessions')
ORDER BY tablename,policyname;

SELECT n.nspname AS schema_name,p.proname AS routine,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS signature,
       pg_catalog.pg_get_userbyid(p.proowner) AS routine_owner,
       p.prosecdef AS security_definer,
       p.proconfig AS routine_config
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('s06_timer_check_work_order','s06_timer_transition','s06_timer_post_labor','is_garage_member')
ORDER BY p.proname;

-- N'affiche PAS les donnees privees des clients. Simple comptage.
SELECT count(*) AS garage_snapshots FROM public.garage_data;
SELECT count(*) AS memberships FROM public.garage_members;
