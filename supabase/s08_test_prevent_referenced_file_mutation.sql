-- S08 TEST ONLY: prevent authenticated clients from deleting/replacing
-- any physical object still referenced by ANY garage BT.
-- Existing objects and garage data are not changed.
CREATE OR REPLACE FUNCTION s08_private.is_bt_attachment_referenced(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=''
AS $body$
  SELECT p_name IS NOT NULL AND (SELECT auth.uid()) IS NOT NULL
    AND EXISTS(
      SELECT 1 FROM public.garage_data d
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
        CASE WHEN pg_catalog.jsonb_typeof(d.data->'workorders')='array'
          THEN d.data->'workorders' ELSE '[]'::jsonb END
      ) w(value)
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
        CASE WHEN pg_catalog.jsonb_typeof(w.value->'attachments')='array'
          THEN w.value->'attachments' ELSE '[]'::jsonb END
      ) a(value)
      WHERE a.value->>'path'=p_name
    );
$body$;
REVOKE ALL ON FUNCTION s08_private.is_bt_attachment_referenced(text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION s08_private.is_bt_attachment_referenced(text)
TO authenticated;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='storage' AND tablename='objects'
     AND policyname='Garage files delete' AND cmd='DELETE'
     AND qual LIKE '%foldername(name)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='storage' AND tablename='objects'
     AND policyname='Garage files update' AND cmd='UPDATE'
     AND qual LIKE '%foldername(name)%'
  ) THEN
    RAISE EXCEPTION 'Storage mutation policy unexpected; migration aborted';
  END IF;
END
$guard$;

DROP POLICY "Garage files delete" ON storage.objects;
CREATE POLICY "Garage files delete" ON storage.objects
FOR DELETE TO authenticated
USING(
 bucket_id='wo-files'
 AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
 AND NOT s08_private.is_bt_attachment_referenced(name)
);

DROP POLICY "Garage files update" ON storage.objects;
CREATE POLICY "Garage files update" ON storage.objects
FOR UPDATE TO authenticated
USING(
 bucket_id='wo-files'
 AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
 AND NOT s08_private.is_bt_attachment_referenced(name)
)
WITH CHECK(
 bucket_id='wo-files'
 AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
 AND NOT s08_private.is_bt_attachment_referenced(name)
);
