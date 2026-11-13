-- S08 TEST: security posture of the three intentionally client-callable timer RPCs.
-- Read-only catalog assertions; do not remove their required authenticated grants.
DO $audit$
DECLARE
 f text;
 source text;
BEGIN
 FOREACH f IN ARRAY ARRAY[
  'public.s06_timer_transition(uuid,text,bigint,text)',
  'public.s06_timer_recover_with_adjustment(uuid,bigint,integer)',
  'public.s06_timer_post_labor(uuid,bigint,bigint,text,numeric)'
 ] LOOP
  SELECT pg_get_functiondef(f::regprocedure) INTO source;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=f::regprocedure AND prosecdef
    AND proconfig @> ARRAY['search_path=""']::text[]) THEN
    RAISE EXCEPTION 'Expected pinned SECURITY DEFINER function missing: %',f;
  END IF;
  IF strpos(source,'auth.uid()')=0
   OR strpos(source,'user_id=v_uid')=0
   OR strpos(source,'pg_advisory_xact_lock')=0
   OR strpos(source,'revision')=0
   OR (strpos(source,'garage_members')=0 AND
       strpos(source,'s06_timer_check_work_order')=0)
  THEN RAISE EXCEPTION 'Required identity/concurrency guards missing: %',f; END IF;
  IF has_function_privilege('anon',f::regprocedure,'EXECUTE')
   OR NOT has_function_privilege('authenticated',f::regprocedure,'EXECUTE')
  THEN RAISE EXCEPTION 'Unexpected RPC execution permissions: %',f; END IF;
 END LOOP;
 RAISE NOTICE 'S08 timer privileged-function guard review passed';
END $audit$;