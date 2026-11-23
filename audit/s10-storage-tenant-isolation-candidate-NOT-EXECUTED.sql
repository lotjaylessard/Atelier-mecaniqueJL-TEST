-- S10 Storage isolation candidate: review required, NOT EXECUTED.
-- Precondition: wo-files has been made PRIVATE, historical paths remain unchanged.
-- Existing PROD objects live under clients/... ; new TEST frontend uploads under <auth.uid()>/clients/...
-- Do NOT run against a public bucket: public URLs bypass RLS on downloads.
-- Do NOT apply until the application has been checked for legacy public URLs.

BEGIN;
DO $guard$
BEGIN
 IF (SELECT public FROM storage.buckets WHERE id='wo-files') IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'wo-files must be private before enabling tenant isolation';
 END IF;
 IF to_regclass('public.garage_members') IS NULL OR to_regclass('public.garage_data') IS NULL THEN
   RAISE EXCEPTION 'Multi-garage schema not installed';
 END IF;
END $guard$;

-- Drop the old permissive policies only for this bucket's historic PROD policy names.
DROP POLICY IF EXISTS "Allow authenticated delete 12vdd8i_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete 12vdd8i_1" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read 12vdd8i_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload 12vdd8i_0" ON storage.objects;

-- Read: own files or another member's files from the SAME garage.
-- Legacy clients/... files: only the original owner, never other garages.
CREATE POLICY "S10 files read tenant" ON storage.objects FOR SELECT TO authenticated
USING (
 bucket_id='wo-files' AND
 (
   (storage.foldername(name))[1] = auth.uid()::text
   OR (
     (storage.foldername(name))[1] = 'clients'
     AND EXISTS (
       SELECT 1 FROM public.garage_data gd
       WHERE gd.user_id=auth.uid() AND gd.garage_id IS NOT NULL
     )
   )
   OR EXISTS (
     SELECT 1 FROM public.garage_members viewer
     JOIN public.garage_members owner_member
       ON owner_member.garage_id=viewer.garage_id
     WHERE viewer.user_id=auth.uid()
       AND owner_member.user_id::text=(storage.foldername(name))[1]
   )
 )
);
CREATE POLICY "S10 files insert own prefix" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='wo-files' AND (storage.foldername(name))[1]=auth.uid()::text);
-- Deliberately no DELETE or UPDATE policy: attachment deletion requires dedicated server validation.
COMMIT;
