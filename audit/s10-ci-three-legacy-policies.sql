-- CI ONLY: exactly the three inherited owner policies observed on the
-- user's local restoration. Executed on a disposable synthetic clone.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database() <> 'atelier_jl_s10_continuation'
    OR (SELECT count(*) FROM public.garage_data) <> 1
    OR (SELECT count(*) FROM auth.users) <> 1
    OR (SELECT count(*) FROM pg_policies
          WHERE schemaname='public' AND tablename='garage_data') <> 0
 THEN RAISE EXCEPTION 'REFUSED: expected fresh disposable CI clone with zero policies'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
 AS $fn$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $fn$;
CREATE POLICY "Users can insert their own data" ON public.garage_data
  FOR INSERT TO PUBLIC WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can read their own data" ON public.garage_data
  FOR SELECT TO PUBLIC USING(auth.uid()=user_id);
CREATE POLICY "Users can update their own data" ON public.garage_data
  FOR UPDATE TO PUBLIC USING(auth.uid()=user_id);
