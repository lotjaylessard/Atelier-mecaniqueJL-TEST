-- S08 / TEST only — read-only PostgreSQL catalog regression checks.
-- Run in Supabase SQL Editor against Atelier-mecaniqueJL-TEST.
-- No garage records are read or modified.
-- RLS plus the absence of anon policies is required even when table-level SELECT
-- grants exist (RLS determines visibility).
DO $audit$
DECLARE
  t text;
  f text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'garage_data','garage_members','garage_quotes','garage_timer_sessions','garages'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relkind IN ('r','p')
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS missing or table missing: %',t;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies p
      WHERE p.schemaname='public' AND p.tablename=t
        AND ('public'=ANY(p.roles) OR 'anon'=ANY(p.roles))
    ) THEN
      RAISE EXCEPTION 'Anonymous or public RLS policy detected: %',t;
    END IF;
  END LOOP;

  -- Internal helper may not be exposed by PostgREST to logged-in clients.
  IF pg_catalog.has_function_privilege('authenticated',
      'public.s06_timer_check_work_order(uuid,uuid,text)'::regprocedure,'EXECUTE')
  THEN
    RAISE EXCEPTION 'Internal timer helper exposed to authenticated users';
  END IF;

  FOREACH f IN ARRAY ARRAY[
    'public.s06_timer_transition(uuid,text,bigint,text)',
    'public.s06_timer_recover_with_adjustment(uuid,bigint,integer)',
    'public.s06_timer_post_labor(uuid,bigint,bigint,text,numeric)',
    'public.s08_convert_quote_to_workorder(uuid,bigint,bigint,boolean)',
    'public.s08_finalize_bt_invoice_unified_staged(uuid,text,text,bigint,jsonb,boolean)'
  ] LOOP
    IF pg_catalog.has_function_privilege('anon',f::regprocedure,'EXECUTE') THEN
      RAISE EXCEPTION 'Anonymous RPC execution granted: %',f;
    END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated',f::regprocedure,'EXECUTE') THEN
      RAISE EXCEPTION 'Required authenticated RPC missing: %',f;
    END IF;
  END LOOP;

  RAISE NOTICE 'S08 TEST RLS/RPC catalog checks passed';
END
$audit$;
