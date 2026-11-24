-- S10 local CLONE only: imitate Supabase SQL roles that the incomplete
-- Windows restore did not restore. Not actual Supabase authentication.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'atelier_jl_s10_continuation' OR
    (inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN (inet '127.0.0.1', inet '::1')) OR
    (SELECT count(*) FROM public.garage_data)<>1 OR
    (SELECT count(*) FROM auth.users)<>1 OR
    (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')<>55 OR
    to_regclass('public.garage_members') IS NULL OR
    to_regclass('public.garage_quotes') IS NULL
 THEN RAISE EXCEPTION 'REFUSED: only a disposable local phase1-4 clone'; END IF;
END $guard$;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $roles$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $fn$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $fn$;
-- Original local pg_restore can yield 0, 3 or 5 legacy policies.
-- 3 is the observed backup state: insert/select/update owned rows survived,
-- while legacy "Allow authenticated users" and "Deny anon" did not.
-- Never replace unexpected rules or touch the existing restore.
DO $policies$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='garage_data';
 IF n NOT IN (0,3,5) THEN
   RAISE EXCEPTION 'REFUSED: unexpected % legacy garage_data RLS policies',n;
 END IF;
 IF n IN (3,5) AND (
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='garage_data'
      AND policyname IN ('Users can insert their own data',
        'Users can read their own data','Users can update their own data')
      AND ((policyname='Users can insert their own data' AND cmd='INSERT') OR
           (policyname='Users can read their own data' AND cmd='SELECT') OR
           (policyname='Users can update their own data' AND cmd='UPDATE'))
      AND roles='{public}' AND permissive='PERMISSIVE')<>3
  OR EXISTS(
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='garage_data'
    AND policyname NOT IN ('Users can insert their own data','Users can read their own data',
      'Users can update their own data','Allow authenticated users','Deny anon'))
 ) THEN RAISE EXCEPTION 'REFUSED: unexpected inherited RLS rule'; END IF;
 IF n=5 AND (
    (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='garage_data'
    AND ((policyname='Allow authenticated users' AND cmd='ALL' AND roles='{authenticated}') OR
         (policyname='Deny anon' AND cmd='ALL' AND roles='{anon}')))<>2)
 THEN RAISE EXCEPTION 'REFUSED: unexpected inherited extra RLS rules'; END IF;
 IF n=0 THEN
  CREATE POLICY "Users can insert their own data" ON public.garage_data
    FOR INSERT TO PUBLIC WITH CHECK(auth.uid()=user_id);
  CREATE POLICY "Users can read their own data" ON public.garage_data
    FOR SELECT TO PUBLIC USING(auth.uid()=user_id);
  CREATE POLICY "Users can update their own data" ON public.garage_data
    FOR UPDATE TO PUBLIC USING(auth.uid()=user_id);
 END IF;
 IF n IN (0,3) THEN
  CREATE POLICY "Allow authenticated users" ON public.garage_data
    FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
  CREATE POLICY "Deny anon" ON public.garage_data
    FOR ALL TO anon USING(false) WITH CHECK(false);
 END IF;
 IF (SELECT count(*) FROM pg_policies
   WHERE schemaname='public' AND tablename='garage_data')<>5 THEN
   RAISE EXCEPTION 'Legacy RLS reconstruction failed';
 END IF;
END $policies$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT SELECT ON public.garage_data TO authenticated;
