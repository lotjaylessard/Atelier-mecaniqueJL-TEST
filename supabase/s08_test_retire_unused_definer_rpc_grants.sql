-- S08 TEST ONLY: retire direct API execution of unused legacy SECURITY DEFINER helpers.
-- No function is deleted; SQL bodies, policies, and data remain unchanged.
DO $guard$
BEGIN
 IF EXISTS (
   SELECT 1 FROM pg_catalog.pg_policies p
   WHERE coalesce(p.qual,'')||coalesce(p.with_check,'') LIKE '%can_read_garage_file%'
      OR coalesce(p.qual,'')||coalesce(p.with_check,'') LIKE '%is_garage_member%'
 ) THEN
   RAISE EXCEPTION 'Legacy helper is still referenced by RLS policy; refusing privilege change';
 END IF;
 IF EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.pronamespace='public'::pg_catalog.regnamespace
     AND p.proname NOT IN ('can_read_garage_file','is_garage_member')
     AND (pg_catalog.pg_get_functiondef(p.oid) LIKE '%can_read_garage_file(%'
       OR pg_catalog.pg_get_functiondef(p.oid) LIKE '%is_garage_member(%')
 ) THEN RAISE EXCEPTION 'Legacy helper referenced by another public function'; END IF;
END
$guard$;

REVOKE EXECUTE ON FUNCTION public.can_read_garage_file(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.is_garage_member(uuid) FROM PUBLIC,anon,authenticated;
