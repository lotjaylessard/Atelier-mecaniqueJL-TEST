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
-- A previous failed pg_restore may have omitted all RLS policies.
-- Create the exact original five PROD rules ONLY when none exist.
DO $policies$
DECLARE count_policy int;
BEGIN
 SELECT count(*) INTO count_policy FROM pg_policies
  WHERE schemaname='public' AND tablename='garage_data';
 IF count_policy NOT IN (0,5) THEN
   RAISE EXCEPTION 'REFUSED: unexpected % legacy garage_data RLS policies',count_policy;
 END IF;
 IF count_policy=5 AND EXISTS (
  SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='garage_data'
  AND policyname NOT IN ('Allow authenticated users','Deny anon',
   'Users can insert their own data','Users can read their own data',
   'Users can update their own data')
 ) THEN
  RAISE EXCEPTION 'REFUSED: garage_data policies do not match the original PROD';
 END IF;
 IF count_policy=0 THEN
  CREATE POLICY "Allow authenticated users" ON public.garage_data
    FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
  CREATE POLICY "Deny anon" ON public.garage_data
    FOR ALL TO anon USING(false) WITH CHECK(false);
  CREATE POLICY "Users can insert their own data" ON public.garage_data
    FOR INSERT TO PUBLIC WITH CHECK(auth.uid()=user_id);
  CREATE POLICY "Users can read their own data" ON public.garage_data
    FOR SELECT TO PUBLIC USING(auth.uid()=user_id);
  CREATE POLICY "Users can update their own data" ON public.garage_data
    FOR UPDATE TO PUBLIC USING(auth.uid()=user_id);
 END IF;
END $policies$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT SELECT ON public.garage_data TO authenticated;
