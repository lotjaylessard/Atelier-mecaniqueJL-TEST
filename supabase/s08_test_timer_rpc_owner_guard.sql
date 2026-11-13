-- S08 TEST ONLY — owner isolation for SECURITY DEFINER timer RPCs.
-- This migration changes function definitions only, not customer/garage records.
-- Preserves existing signatures, access grants and transactional locking.
DO $s08$
DECLARE
  v_original text;
  v_patched text;
  v_old text;
  v_new text;
BEGIN
  v_old := 'FROM public.garage_data gd WHERE gd.garage_id=p_garage_id FOR SHARE;';
  v_new := 'FROM public.garage_data gd WHERE gd.garage_id=p_garage_id AND gd.user_id=p_uid FOR SHARE;';
  SELECT pg_catalog.pg_get_functiondef('public.s06_timer_check_work_order(uuid,uuid,text)'::pg_catalog.regprocedure)
    INTO v_original;
  IF v_original IS NULL OR
    (pg_catalog.length(v_original)-pg_catalog.length(pg_catalog.replace(v_original,v_old,'')))
      <> pg_catalog.length(v_old) THEN
    RAISE EXCEPTION 'Unexpected s06_timer_check_work_order definition; no changes applied';
  END IF;
  v_patched := pg_catalog.replace(v_original,v_old,v_new);
  EXECUTE v_patched;

  v_old := 'FROM public.garage_data gd WHERE gd.garage_id=v_session.garage_id';
  v_new := 'FROM public.garage_data gd WHERE gd.garage_id=v_session.garage_id AND gd.user_id=v_uid';
  SELECT pg_catalog.pg_get_functiondef('public.s06_timer_post_labor(uuid,bigint,bigint,text,numeric)'::pg_catalog.regprocedure)
    INTO v_original;
  IF v_original IS NULL OR
    (pg_catalog.length(v_original)-pg_catalog.length(pg_catalog.replace(v_original,v_old,'')))
      <> pg_catalog.length(v_old) THEN
    RAISE EXCEPTION 'Unexpected s06_timer_post_labor definition; transaction rolls back';
  END IF;
  v_patched := pg_catalog.replace(v_original,v_old,v_new);
  EXECUTE v_patched;
END
$s08$;
