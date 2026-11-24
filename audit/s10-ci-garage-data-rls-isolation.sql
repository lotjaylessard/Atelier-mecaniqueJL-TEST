-- Synthetic AUTH/RLS isolation test for the COMPLETE S10 SQL candidate.
-- Runs ONLY against the disposable CI database. All changes ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'atelier_jl_restore_test'
  OR (SELECT count(*) FROM public.garage_data)<>1
  OR (SELECT count(*) FROM auth.users)<>1
  OR NOT EXISTS(SELECT 1 FROM auth.users
    WHERE id='00000000-0000-4000-8000-000000000001'::uuid)
 THEN RAISE EXCEPTION 'REFUSED: not the one-user synthetic database'; END IF;
 IF (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename='garage_data')<>2
  OR EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='garage_data'
       AND policyname NOT IN ('Garage members read active garage data',
                              'Garage members update active garage data'))
 THEN RAISE EXCEPTION 'S10 ERROR: legacy garage_data policies remain'; END IF;
 IF has_table_privilege('anon','public.garage_data','SELECT')
   OR has_table_privilege('anon','public.garage_data','DELETE')
   OR has_table_privilege('authenticated','public.garage_data','DELETE')
   OR has_table_privilege('authenticated','public.garage_data','INSERT')
   OR has_table_privilege('authenticated','public.garage_data','TRUNCATE')
   OR NOT has_table_privilege('authenticated','public.garage_data','SELECT')
   OR NOT has_table_privilege('authenticated','public.garage_data','UPDATE')
 THEN RAISE EXCEPTION 'S10 ERROR: unsafe garage_data table privileges'; END IF;
END $guard$;
-- Two additional invented users, one employee of Garage A, one owner of B.
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
INSERT INTO public.garages(id,name) VALUES
 ('10000000-0000-4000-8000-000000000002','SYNTHETIC GARAGE B');
INSERT INTO public.garage_members(garage_id,user_id,role)
SELECT id,'00000000-0000-4000-8000-000000000002','employee'
FROM public.garages WHERE name='Atelier Mécanique JL';
INSERT INTO public.garage_members(garage_id,user_id,role)
VALUES ('10000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003','owner');
INSERT INTO public.garage_data(user_id,garage_id,data)
VALUES ('00000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000002',
        '{"clients":[],"workorders":[],"invoices":[]}'::jsonb);
-- Switch to the simulated authenticated employee JWT.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000002',true);
DO $test$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.garage_data;
 IF n<>1 THEN RAISE EXCEPTION 'Employee must see exactly own garage, saw %',n; END IF;
 SELECT count(*) INTO n FROM public.garage_data
 WHERE user_id='00000000-0000-4000-8000-000000000001';
 IF n<>1 THEN RAISE EXCEPTION 'Employee cannot see Garage A'; END IF;
 UPDATE public.garage_data SET version=version
 WHERE user_id='00000000-0000-4000-8000-000000000001';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Employee cannot update Garage A'; END IF;
 UPDATE public.garage_data SET version=version
 WHERE user_id='00000000-0000-4000-8000-000000000003';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Employee improperly updated Garage B'; END IF;
END $test$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000003',true);
DO $test$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.garage_data;
 IF n<>1 THEN RAISE EXCEPTION 'Garage B must see exactly own data, saw %',n; END IF;
 SELECT count(*) INTO n FROM public.garage_data
 WHERE user_id='00000000-0000-4000-8000-000000000001';
 IF n<>0 THEN RAISE EXCEPTION 'Cross-garage data leak'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
\echo S10_GARAGE_DATA_RLS_ISOLATION_OK
