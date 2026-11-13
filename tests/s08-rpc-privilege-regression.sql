-- S08 TEST — unused SECURITY DEFINER helpers remain non-executable
-- while the three required timer RPCs remain authenticated-only.
-- Catalog inspection only; never changes permissions or garage data.
DO $audit$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'public.can_read_garage_file(uuid)',
    'public.is_garage_member(uuid)'
  ] LOOP
    IF has_function_privilege('anon',name::regprocedure,'EXECUTE')
       OR has_function_privilege('authenticated',name::regprocedure,'EXECUTE')
    THEN RAISE EXCEPTION 'Legacy helper unexpectedly executable: %',name; END IF;
  END LOOP;
  FOREACH name IN ARRAY ARRAY[
    'public.s06_timer_transition(uuid,text,bigint,text)',
    'public.s06_timer_recover_with_adjustment(uuid,bigint,integer)',
    'public.s06_timer_post_labor(uuid,bigint,bigint,text,numeric)'
  ] LOOP
    IF has_function_privilege('anon',name::regprocedure,'EXECUTE')
       OR NOT has_function_privilege('authenticated',name::regprocedure,'EXECUTE')
    THEN RAISE EXCEPTION 'Timer RPC execution grant unexpected: %',name; END IF;
  END LOOP;
  RAISE NOTICE 'S08 helper privilege regression passed';
END $audit$;