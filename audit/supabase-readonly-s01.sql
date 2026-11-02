-- AUDIT S01 — SUPABASE TEST UNIQUEMENT — LECTURE SEULE
-- Aucun INSERT, UPDATE, DELETE, ALTER, DROP ni appel Storage.
-- IMPORTANT : verifier que le projet est nraijzsodgojkpyigefu AVANT execution.

-- 1. État RLS des tables applicatives
select n.nspname as schema_name,c.relname as table_name,
       c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p')
and c.relname in ('garage_data','garage_members','garages')
order by c.relname;

-- 2. Politiques applicatives + stockage (definitions, sans données métier)
select schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check
from pg_policies
where (schemaname='public' and tablename in ('garage_data','garage_members','garages'))
   or (schemaname='storage' and tablename='objects')
order by schemaname,tablename,policyname;

-- 3. Vérification de la fonction qui autorise les fichiers des membres
select n.nspname as schema_name,p.proname as function_name,
       p.prosecdef as security_definer,
       p.provolatile as volatility,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='can_read_garage_file';

-- 4. Comptage uniquement, sans noms ni contenu
select
  (select count(*) from public.garages) as garages_count,
  (select count(*) from public.garage_members) as memberships_count,
  (select count(*) from public.garage_data) as garage_data_rows_count;

-- 5. Comptage des appartenances multiples (l'application exige un garage par utilisateur)
select count(*) as users_with_multiple_garages
from (
  select user_id from public.garage_members
  group by user_id having count(distinct garage_id)>1
) x;

-- 6. Test structurel : comptes d'un garage présents dans un autre
select count(*) as repeated_membership_pairs
from (
  select garage_id,user_id,count(*) as n
  from public.garage_members group by garage_id,user_id having count(*)>1
) x;

-- 7. Chemins de fichiers potentiellement mal structurés (compte, sans afficher de chemins)
select count(*) as malformed_storage_paths
from storage.objects
where bucket_id='wo-files'
  and (name is null or split_part(name,'/',1) !~*
   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- 8. Statut public/privé du bucket
select id,public,file_size_limit,allowed_mime_types
from storage.buckets where id='wo-files';
