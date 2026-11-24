-- S10 synthetic mutation RLS checks: writes are made ONLY inside transaction
-- on isolated GitHub Actions Postgres and ROLLBACK unconditionally.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'atelier_jl_restore_test'
 OR (SELECT count(*) FROM auth.users)<>1
 OR (SELECT count(*) FROM public.garage_data)<>1
 OR (SELECT count(*) FROM public.garage_quotes)<>0
 OR (SELECT count(*) FROM public.garage_members)<>1
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id='00000000-0000-4000-8000-000000000001')
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='garage_quotes')<>4
 THEN RAISE EXCEPTION 'REFUSED: synthetic isolated S10 candidate only'; END IF;
END $guard$;

-- Arrange two garages and three fake users. No real customer data.
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
INSERT INTO public.garages(id,name) VALUES
 ('10000000-0000-4000-8000-000000000002','S10 GENERATED GARAGE B');
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

-- Employee A can create only their OWN quote in Garage A.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
INSERT INTO public.garage_quotes (garage_id,user_id,quote_number,content)
SELECT id,'00000000-0000-4000-8000-000000000002',
 'SO-9001','{"clientName":"Synthetic Client","test":true}'::jsonb
FROM public.garages WHERE name='Atelier Mécanique JL';

DO $test$
DECLARE denied_other_garage boolean:=false; denied_spoofed_user boolean:=false;
DECLARE a uuid; b uuid; n integer;
BEGIN
 SELECT id INTO a FROM public.garages WHERE name='Atelier Mécanique JL';
 b:='10000000-0000-4000-8000-000000000002';
 BEGIN
   INSERT INTO public.garage_quotes(garage_id,user_id,quote_number,content)
     VALUES(b,'00000000-0000-4000-8000-000000000002','SO-9002','{"clientName":"Synthetic Client"}');
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN
   denied_other_garage:=true;
 END;
 BEGIN
   INSERT INTO public.garage_quotes(garage_id,user_id,quote_number,content)
     VALUES(a,'00000000-0000-4000-8000-000000000001','SO-9003','{"clientName":"Synthetic Client"}');
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN
   denied_spoofed_user:=true;
 END;
 IF NOT(denied_other_garage AND denied_spoofed_user) THEN
   RAISE EXCEPTION 'CROSS_GARAGE_OR_USER_SPOOF_INSERT_ALLOWED';
 END IF;
 -- Authorized update of own quote should work.
 UPDATE public.garage_quotes SET status='sent'
   WHERE user_id='00000000-0000-4000-8000-000000000002' AND garage_id=a AND content->>'test'='true';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Employee cannot update authorized quote'; END IF;
 -- Changing garage assignment must be rejected by WITH CHECK.
 BEGIN
   UPDATE public.garage_quotes SET garage_id=b
   WHERE user_id='00000000-0000-4000-8000-000000000002' AND garage_id=a AND content->>'test'='true';
   RAISE EXCEPTION 'CROSS_GARAGE_QUOTE_MOVE_ALLOWED';
 EXCEPTION
   WHEN insufficient_privilege OR check_violation THEN NULL;
 END;
 SELECT count(*) INTO n FROM public.garage_quotes WHERE garage_id=a;
 IF n<>1 THEN RAISE EXCEPTION 'Authorized quote was lost'; END IF;
END $test$;
RESET ROLE;

-- Owner B cannot alter Garage A quotes or Garage A's JSON.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $test$
DECLARE n int;
BEGIN
 UPDATE public.garage_quotes SET status='approved'
 WHERE user_id='00000000-0000-4000-8000-000000000002' AND content->>'test'='true';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Owner B updated Garage A quote'; END IF;
 UPDATE public.garage_data SET version=version+1
 WHERE garage_id=(SELECT id FROM public.garages WHERE name='Atelier Mécanique JL');
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Owner B updated Garage A data'; END IF;
END $test$;
RESET ROLE;

-- Changes to Auth, quote, JSON and membership records are all reverted.
ROLLBACK;
\echo S10_SYNTHETIC_WRITE_RLS_ROLLBACK_PASS
