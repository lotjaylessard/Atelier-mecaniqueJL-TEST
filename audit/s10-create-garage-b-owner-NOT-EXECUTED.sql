-- S10 — GARAGE B / OWNER B (CANDIDATE, NEVER EXECUTE BEFORE EXPLICIT PROD GO)
-- This applies ONLY AFTER the S10 schema migration in the target PROD database.
-- Enter friend Auth UID into the UUID literal below at cutover after verifying it from
-- the destination Supabase Authentication > Users (not source-project Auth UUID).
-- A separate validated import will create the friend garage_data row; NO EMPTY row here.
-- No TEST data. No permissions for owner B on garage A. No publication.
-- The S10 complete migration candidate currently expects 1 original garage data row.
-- Run this only AFTER that candidate, and after obtaining specific user authorization.
BEGIN;
DO $s10_create_garage_b$
DECLARE
 v_friend_id uuid := '00000000-0000-4000-8000-000000000000'::uuid; -- REPLACE WITH DESTINATION AUTH UID
 v_owner_a uuid;
 v_garage_a uuid;
 v_garage_b uuid;
BEGIN
 IF v_friend_id='00000000-0000-4000-8000-000000000000'::uuid THEN
   RAISE EXCEPTION 'STOP: replace the placeholder destination Auth UUID before attempting cutover';
 END IF;
 IF to_regclass('public.garages') IS NULL
    OR to_regclass('public.garage_members') IS NULL
    OR to_regclass('public.garage_data') IS NULL
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='garage_data' AND column_name='garage_id') THEN
   RAISE EXCEPTION 'STOP: S10 multi-garage schema not yet migrated';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_friend_id) THEN
   RAISE EXCEPTION 'STOP: friend destination Auth account does not exist';
 END IF;
 IF (SELECT count(*) FROM public.garages)<>1
    OR (SELECT count(*) FROM public.garage_data)<>1
    OR (SELECT count(*) FROM public.garage_members WHERE role='owner')<>1 THEN
   RAISE EXCEPTION 'STOP: expected exactly one migrated garage A and its data + owner';
 END IF;
 SELECT gd.user_id,gd.garage_id INTO v_owner_a,v_garage_a
 FROM public.garage_data gd LIMIT 1;
 IF v_owner_a IS NULL OR v_garage_a IS NULL OR v_owner_a=v_friend_id THEN
   RAISE EXCEPTION 'STOP: original garage mapping invalid or owner B equals owner A';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.garage_members
               WHERE garage_id=v_garage_a AND user_id=v_owner_a AND role='owner') THEN
   RAISE EXCEPTION 'STOP: original garage A owner membership invalid';
 END IF;
 IF EXISTS(SELECT 1 FROM public.garage_members WHERE user_id=v_friend_id)
    OR EXISTS(SELECT 1 FROM public.garage_data WHERE user_id=v_friend_id) THEN
   RAISE EXCEPTION 'STOP: friend is already linked; do not risk second or cross-garage membership';
 END IF;
 IF EXISTS(SELECT 1 FROM public.garages WHERE name='Garage de l’ami — NOM À CONFIRMER') THEN
   RAISE EXCEPTION 'STOP: planned garage already exists';
 END IF;

 INSERT INTO public.garages(name) VALUES ('Garage de l’ami — NOM À CONFIRMER')
 RETURNING id INTO v_garage_b;
 INSERT INTO public.garage_members(garage_id,user_id,role)
 VALUES (v_garage_b,v_friend_id,'owner');

 IF (SELECT count(*) FROM public.garage_members WHERE user_id=v_friend_id)<>1
    OR NOT EXISTS(SELECT 1 FROM public.garage_members WHERE garage_id=v_garage_b AND user_id=v_friend_id AND role='owner')
    OR EXISTS(SELECT 1 FROM public.garage_members WHERE garage_id=v_garage_a AND user_id=v_friend_id)
    OR (SELECT count(*) FROM public.garage_data)<>1
    OR (SELECT count(*) FROM public.garages)<>2 THEN
   RAISE EXCEPTION 'STOP: isolation invariant failed; transaction rolls back';
 END IF;
 RAISE NOTICE 'Garage B provisioned; garage_data for friend MUST be imported separately and verified before launch';
END $s10_create_garage_b$;
COMMIT;
