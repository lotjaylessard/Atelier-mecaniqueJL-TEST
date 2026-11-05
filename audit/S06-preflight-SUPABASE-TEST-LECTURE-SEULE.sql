-- S06 : PREVOL DE SCHEMA — LECTURE SEULE, SUPABASE TEST UNIQUEMENT.
-- Ne pas utiliser ces resultats pour conclure au comportement de RLS :
-- le SQL Editor peut disposer de droits elevés. Aucun nom ni contenu de client expose.
-- Ne lancer qu'apres confirmation de l'IDENTITE DU PROJET TEST.
-- 1. Tables et RLS
select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
and c.relname in ('garage_data','garage_members','garage_timer_sessions')
order by c.relname;
-- 2. Colonnes dont depend la future validation du BT.
select table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in ('garage_data','garage_members','garage_timer_sessions')
  and column_name in ('user_id','garage_id','data','version','id','status','work_order_id','confirmed_ms','revision')
order by table_name,ordinal_position;
-- 3. Politiques de lecture et ecriture existantes (sans donnees metier)
select tablename,policyname,cmd,roles,qual,with_check
from pg_catalog.pg_policies
where schemaname='public'
and tablename in ('garage_data','garage_members','garage_timer_sessions')
order by tablename,policyname;
-- 4. Presence eventuelle de routines S06 (ne les execute pas)
select p.proname,p.prosecdef,p.provolatile,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
  pg_catalog.pg_get_userbyid(p.proowner) as owner
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 's06_timer_%';
-- 5. Compteurs uniquement, sans UUID, contenu ni donnees clients.
select (select count(*) from public.garage_data) as garage_data_count,
       (select count(*) from public.garage_members) as garage_members_count;
-- 6. Les droits reels (deux comptes, RLS, RPC) doivent etre testes
--    PAR DES SESSIONS authentifiees, non dans le SQL Editor.
