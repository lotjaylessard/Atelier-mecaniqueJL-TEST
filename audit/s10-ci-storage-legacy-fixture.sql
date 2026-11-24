-- CI only. Recreate physical Storage policy CATALOG in disposable PostgreSQL.
-- Must be called after full SQL migration, never on a cloud project.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'atelier_jl_restore_test'
   OR (SELECT count(*) FROM auth.users)<>1
   OR (SELECT count(*) FROM public.garage_data)<>1
   OR NOT EXISTS(SELECT 1 FROM auth.users
     WHERE id='00000000-0000-4000-8000-000000000001'::uuid)
 THEN RAISE EXCEPTION 'REFUSED: only synthetic CI database'; END IF;
 IF to_regclass('storage.buckets') IS NOT NULL
 THEN RAISE EXCEPTION 'REFUSED: already initialized'; END IF;
END $guard$;
CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean NOT NULL);
INSERT INTO storage.buckets(id,public) VALUES ('wo-files',false);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA auth, storage TO authenticated, anon;
GRANT SELECT ON TABLE storage.objects TO authenticated;
-- Reproduce four legacy production policy names. These are deliberately
-- permissive; the isolation candidate must drop them in a single transaction.
CREATE POLICY "Allow authenticated upload 12vdd8i_0" ON storage.objects
 FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated read 12vdd8i_0" ON storage.objects
 FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete 12vdd8i_0" ON storage.objects
 FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete 12vdd8i_1" ON storage.objects
 FOR SELECT TO authenticated USING (true);
