-- S08 TEST: regression after timer RPC owner-guard migration.
-- Catalog-only assertions; no customer records read or changed.
DO $audit$
DECLARE
  checker oid := 'public.s06_timer_check_work_order(uuid,uuid,text)'::regprocedure::oid;
  poster oid := 'public.s06_timer_post_labor(uuid,bigint,bigint,text,numeric)'::regprocedure::oid;
  checker_source text;
  poster_source text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(checker) INTO checker_source;
  SELECT pg_catalog.pg_get_functiondef(poster) INTO poster_source;

  IF pg_catalog.strpos(checker_source,'gd.garage_id=p_garage_id AND gd.user_id=p_uid FOR SHARE')=0 THEN
    RAISE EXCEPTION 'Missing owner guard in work-order timer checker';
  END IF;
  IF pg_catalog.strpos(poster_source,'gd.garage_id=v_session.garage_id AND gd.user_id=v_uid')=0 THEN
    RAISE EXCEPTION 'Missing owner guard in timer posting function';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid=checker AND prosecdef)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid=poster AND prosecdef) THEN
    RAISE EXCEPTION 'Timer RPC security mode unexpectedly changed';
  END IF;
  IF pg_catalog.has_function_privilege('anon',checker,'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',poster,'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated',checker,'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated',poster,'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected timer RPC execute permissions';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='garage_data'
      AND policyname='Garage owner access' AND cmd='ALL'
      AND qual='(auth.uid() = user_id)' AND with_check='(auth.uid() = user_id)'
  ) THEN
    RAISE EXCEPTION 'Owner-only garage_data RLS policy missing';
  END IF;
  RAISE NOTICE 'S08 timer owner guard and RLS checks passed';
END
$audit$;
