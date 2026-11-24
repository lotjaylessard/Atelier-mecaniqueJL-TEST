-- CI ONLY. Simulate the smallest subset of Supabase roles/API identity
-- needed to execute the complete candidate DDL inside a throwaway PostgreSQL.
-- NO production/customer data or real credentials.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'atelier_jl_restore_test' OR
    to_regclass('auth.users') IS NULL OR to_regclass('public.garage_data') IS NULL THEN
   RAISE EXCEPTION 'REFUSED: requires fresh synthetic local fixture';
 END IF;
 IF (SELECT count(*) FROM auth.users)<>1 OR
    (SELECT count(*) FROM public.garage_data)<>1 THEN
   RAISE EXCEPTION 'REFUSED: synthetic fixture row count mismatch';
 END IF;
 IF EXISTS (SELECT 1 FROM auth.users WHERE id<>'00000000-0000-4000-8000-000000000001'::uuid) THEN
   RAISE EXCEPTION 'REFUSED: unexpected identity present, not a synthetic fixture';
 END IF;
END $guard$;
DO $roles$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   CREATE ROLE anon NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   CREATE ROLE authenticated NOLOGIN;
 END IF;
END $roles$;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $fn$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$fn$;
-- These roles/functions only simulate SQL resolution and catalog grants.
-- They DO NOT demonstrate a real authenticated Supabase browser session.

-- Recreate the five legacy PROD policies and excessive grants in CI.
-- The candidate must remove these exact policies before adding tenant access.
GRANT ALL ON TABLE public.garage_data TO anon, authenticated;
CREATE POLICY "Allow authenticated users" ON public.garage_data
 FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Deny anon" ON public.garage_data
 FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Users can insert their own data" ON public.garage_data
 FOR INSERT TO PUBLIC WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users can read their own data" ON public.garage_data
 FOR SELECT TO PUBLIC USING (auth.uid()=user_id);
CREATE POLICY "Users can update their own data" ON public.garage_data
 FOR UPDATE TO PUBLIC USING (auth.uid()=user_id);
