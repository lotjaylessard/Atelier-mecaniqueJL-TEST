-- CI ONLY: restore legacy PUBLIC bucket and four permissive legacy policies
-- on a disposable one-user PostgreSQL, to rehearse the atomic cutover.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'atelier_jl_restore_test'
 OR (SELECT count(*) FROM auth.users)<>1
 OR (SELECT count(*) FROM public.garage_data)<>1
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')<>55
 OR (SELECT public FROM storage.buckets WHERE id='wo-files') IS DISTINCT FROM false
 OR (SELECT count(*) FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects')<>2
 THEN RAISE EXCEPTION 'REFUSED: disposable synthetic Storage only'; END IF;
END $guard$;
BEGIN;
DROP POLICY "S10 files read tenant" ON storage.objects;
DROP POLICY "S10 files insert own prefix" ON storage.objects;
CREATE POLICY "Allow authenticated upload 12vdd8i_0" ON storage.objects
 FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated read 12vdd8i_0" ON storage.objects
 FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete 12vdd8i_0" ON storage.objects
 FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete 12vdd8i_1" ON storage.objects
 FOR SELECT TO authenticated USING (true);
UPDATE storage.buckets SET public=true WHERE id='wo-files';
COMMIT;
