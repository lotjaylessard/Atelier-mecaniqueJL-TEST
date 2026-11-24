-- S10: authenticated Storage access checks, synthetic-only.
-- Run AFTER complete S10 SQL and storage policy candidate; all data rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'atelier_jl_restore_test'
 OR (SELECT count(*) FROM auth.users)<>1
 OR NOT EXISTS(SELECT 1 FROM auth.users
 WHERE id='00000000-0000-4000-8000-000000000001')
 OR (SELECT count(*) FROM public.garage_data)<>1
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')<>55
 OR (SELECT public FROM storage.buckets WHERE id='wo-files') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'REFUSED: synthetic-only isolated storage check'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects')<>2
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
   AND policyname NOT IN ('S10 files read tenant','S10 files insert own prefix'))
 THEN RAISE EXCEPTION 'Unexpected storage policy after candidate migration'; END IF;
END $guard$;
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
INSERT INTO public.garages(id,name) VALUES
 ('10000000-0000-4000-8000-000000000002','SYNTHETIC GARAGE B');
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
INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES
 ('wo-files','00000000-0000-4000-8000-000000000001/clients/new-owner-a',
  '00000000-0000-4000-8000-000000000001'),
 ('wo-files','00000000-0000-4000-8000-000000000002/clients/new-employee-a',
  '00000000-0000-4000-8000-000000000002'),
 ('wo-files','00000000-0000-4000-8000-000000000003/clients/new-owner-b',
  '00000000-0000-4000-8000-000000000003');
-- Verify no anon SELECT grant survives the cutover in this synthetic DB.
DO $check$
BEGIN
 IF has_table_privilege('anon','storage.objects','SELECT') THEN
  RAISE EXCEPTION 'Anonymous Storage SELECT should not be granted'; END IF;
END $check$;
-- USER A owner: 55 old paths + own new + employee new (57); not Garage B.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $test$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='wo-files';
 IF n<>57 THEN RAISE EXCEPTION 'Owner A can see % files instead of 57',n; END IF;
 SELECT count(*) INTO n FROM storage.objects
 WHERE name='00000000-0000-4000-8000-000000000003/clients/new-owner-b';
 IF n<>0 THEN RAISE EXCEPTION 'Owner A can see Garage B attachment'; END IF;
END $test$;
RESET ROLE;
-- EMPLOYEE A: all 55 historical and both A files, never B.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
DO $test$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='wo-files';
 IF n<>57 THEN RAISE EXCEPTION 'Employee A can see % files instead of 57',n; END IF;
 SELECT count(*) INTO n FROM storage.objects
 WHERE name='00000000-0000-4000-8000-000000000003/clients/new-owner-b';
 IF n<>0 THEN RAISE EXCEPTION 'Employee A can see Garage B attachment'; END IF;
END $test$;
RESET ROLE;
-- OWNER B: only his one new file. Old client/ paths are owned by Garage A.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $test$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='wo-files';
 IF n<>1 THEN RAISE EXCEPTION 'Owner B can see % files instead of 1',n; END IF;
 SELECT count(*) INTO n FROM storage.objects WHERE name LIKE 'clients/%';
 IF n<>0 THEN RAISE EXCEPTION 'Owner B can see legacy Garage A attachment'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
\echo S10_STORAGE_TENANT_RLS_ISOLATION_OK
