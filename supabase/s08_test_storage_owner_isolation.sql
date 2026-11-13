-- S08 TEST ONLY: restrict Storage SELECT to owner-prefixed files plus immutable
-- audited legacy grants. Does not modify or relocate physical Storage objects.
-- Data access model: individual account data, not shared-garage member files.
DO $guard$
DECLARE v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Garage files select'
      AND cmd='SELECT'
      AND qual LIKE '%can_read_garage_file%'
  ) THEN
    RAISE EXCEPTION 'Unexpected pre-existing Storage SELECT policy';
  END IF;
  WITH refs AS (
    SELECT d.user_id, a.value->>'path' AS path
    FROM public.garage_data d
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      CASE WHEN pg_catalog.jsonb_typeof(d.data->'workorders')='array'
      THEN d.data->'workorders' ELSE '[]'::jsonb END
    ) w(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      CASE WHEN pg_catalog.jsonb_typeof(w.value->'attachments')='array'
      THEN w.value->'attachments' ELSE '[]'::jsonb END
    ) a(value)
  )
  SELECT count(*) INTO v_count FROM refs r
  JOIN storage.objects o ON o.bucket_id='wo-files' AND o.name=r.path
  WHERE split_part(o.name,'/',1)<>r.user_id::text
    AND o.owner_id=split_part(o.name,'/',1);
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Expected exactly one verified legacy cross-owner file, found %',v_count;
  END IF;
END
$guard$;

CREATE SCHEMA s08_private;
REVOKE ALL ON SCHEMA s08_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA s08_private TO authenticated;

CREATE TABLE s08_private.storage_legacy_grants (
  user_id uuid NOT NULL,
  object_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,object_name)
);
REVOKE ALL ON s08_private.storage_legacy_grants FROM PUBLIC, anon, authenticated;
ALTER TABLE s08_private.storage_legacy_grants ENABLE ROW LEVEL SECURITY;

-- Snapshot the single previously referenced legacy file. No client can add
-- grants through this table or through editing a BT/garage_data JSON.
INSERT INTO s08_private.storage_legacy_grants(user_id,object_name)
SELECT d.user_id,o.name
FROM public.garage_data d
CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
  CASE WHEN pg_catalog.jsonb_typeof(d.data->'workorders')='array'
  THEN d.data->'workorders' ELSE '[]'::jsonb END
) w(value)
CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
  CASE WHEN pg_catalog.jsonb_typeof(w.value->'attachments')='array'
  THEN w.value->'attachments' ELSE '[]'::jsonb END
) a(value)
JOIN storage.objects o ON o.bucket_id='wo-files' AND o.name=a.value->>'path'
WHERE split_part(o.name,'/',1)<>d.user_id::text
  AND o.owner_id=split_part(o.name,'/',1);

CREATE FUNCTION s08_private.can_read_legacy_file(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=''
AS $body$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM s08_private.storage_legacy_grants g
    WHERE g.user_id=(SELECT auth.uid()) AND g.object_name=p_name
  );
$body$;
REVOKE ALL ON FUNCTION s08_private.can_read_legacy_file(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION s08_private.can_read_legacy_file(text) TO authenticated;

DROP POLICY "Garage files select" ON storage.objects;
CREATE POLICY "Garage files select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id='wo-files' AND
  (
    (storage.foldername(name))[1]=(SELECT auth.uid())::text
    OR (SELECT s08_private.can_read_legacy_file(name))
  )
);
