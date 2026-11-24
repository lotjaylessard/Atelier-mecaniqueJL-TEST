-- S10: SECURITY DEFINER timer + owner-only invoice RPC authorization tests.
-- All writes are synthetic and happen in one transaction, then ROLLBACK.
-- Never run against PROD or TEST.
\set ON_ERROR_STOP on
BEGIN;
DO $preflight$
BEGIN
 IF current_database()<>'atelier_jl_restore_test'
 OR (SELECT count(*) FROM auth.users)<>1
 OR (SELECT count(*) FROM public.garage_data)<>1
 OR (SELECT count(*) FROM public.garage_members)<>1
 OR (SELECT count(*) FROM public.garage_timer_sessions)<>0
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='garage_data')<>2
 OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id='00000000-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'REFUSED: disposable S10 synthetic database only'; END IF;
END $preflight$;

-- CI fixture lacks Supabase's standard auth schema USAGE grant; emulate it
-- within this transaction only, so auth.uid() can resolve for invoker RPCs.
GRANT USAGE ON SCHEMA auth TO authenticated;

-- All IDs/data fabricated in this job. Insert as superuser only to build
-- a synthetic timer session; authenticated role may not insert directly.
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
INSERT INTO public.garages(id,name) VALUES
 ('10000000-0000-4000-8000-000000000002','S10 GARAGE B TIMER');
INSERT INTO public.garage_members(garage_id,user_id,role)
SELECT id,'00000000-0000-4000-8000-000000000002','employee'
FROM public.garages WHERE name='Atelier Mécanique JL';
INSERT INTO public.garage_members(garage_id,user_id,role) VALUES
 ('10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003','owner');
INSERT INTO public.garage_data(user_id,garage_id,data) VALUES
 ('00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000002',
  '{"clients":[],"workorders":[],"invoices":[]}'::jsonb);
INSERT INTO public.garage_timer_sessions(id,user_id,garage_id,work_order_id)
SELECT '30000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000001',id,'BT-SYNTHETIC-1'
FROM public.garages WHERE name='Atelier Mécanique JL';

-- Capture Garage A's ID before switching to a role that cannot SELECT it.
-- The test must pass a real inaccessible garage UUID, not NULL.
SELECT set_config('s10.test_garage_a',
 (SELECT id::text FROM public.garages WHERE name='Atelier Mécanique JL'),true);
DO $check_fixture$
BEGIN
 IF nullif(current_setting('s10.test_garage_a',true),'') IS NULL
 THEN RAISE EXCEPTION 'S10 fixture garage A is missing'; END IF;
END $check_fixture$;

-- An authenticated Garage B owner must not operate an A-owned timer or
-- finalize an A-owned invoice, even though these RPCs have EXECUTE grants.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $deny$
DECLARE timer_denied boolean:=false;
        recovery_denied boolean:=false;
        invoice_denied boolean:=false;
        v_a uuid;
BEGIN
 v_a:=current_setting('s10.test_garage_a')::uuid;
 BEGIN
  PERFORM public.s06_timer_transition('30000000-0000-4000-8000-000000000001','pause',0,NULL);
 EXCEPTION WHEN insufficient_privilege THEN timer_denied:=true;
 END;
 BEGIN
  PERFORM public.s06_timer_recover_with_adjustment('30000000-0000-4000-8000-000000000001',0,1);
 EXCEPTION WHEN insufficient_privilege THEN recovery_denied:=true;
 END;
 BEGIN
  PERFORM public.s10_finalize_bt_invoice_owner_candidate(v_a,'BT-SYNTHETIC-1','BT-SYNTHETIC-1',0,'{}'::jsonb,true);
 EXCEPTION WHEN OTHERS THEN
  IF position('Garage owner authorization required' in SQLERRM)>0 THEN invoice_denied:=true;
  ELSE RAISE; END IF;
 END;
 IF NOT(timer_denied AND recovery_denied AND invoice_denied) THEN
  RAISE EXCEPTION 'SECURITY FAILURE: cross-garage timer transition %, timer recovery %, invoice %',
    timer_denied,recovery_denied,invoice_denied;
 END IF;
END $deny$;
RESET ROLE;

-- Employee A is a member of A but does not own the session or the garage_data
-- row. Timer is per-user; candidate invoice RPC is owner-only.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
DO $deny_employee$
DECLARE timer_denied boolean:=false; invoice_denied boolean:=false; v_a uuid;
BEGIN
 v_a:=current_setting('s10.test_garage_a')::uuid;
 BEGIN
  PERFORM public.s06_timer_transition('30000000-0000-4000-8000-000000000001','pause',0,NULL);
 EXCEPTION WHEN insufficient_privilege THEN timer_denied:=true;
 END;
 BEGIN
  PERFORM public.s10_finalize_bt_invoice_owner_candidate(v_a,'BT-SYNTHETIC-1','BT-SYNTHETIC-1',0,'{}'::jsonb,true);
 EXCEPTION WHEN OTHERS THEN
  IF position('Garage owner authorization required' in SQLERRM)>0 THEN invoice_denied:=true;
  ELSE RAISE; END IF;
 END;
 IF NOT(timer_denied AND invoice_denied) THEN
  RAISE EXCEPTION 'SECURITY FAILURE: employee timer-own %, invoice-owner %',timer_denied,invoice_denied;
 END IF;
END $deny_employee$;
RESET ROLE;
ROLLBACK;
\echo S10_SYNTHETIC_TIMER_INVOICE_AUTHORIZATION_ROLLBACK_PASS
