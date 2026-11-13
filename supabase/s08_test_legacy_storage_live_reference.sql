-- S08 TEST ONLY: a legacy cross-owner Storage grant is valid ONLY while
-- its exact object path is still referenced by a BT owned by that user.
-- No grants, attachments, workorders or Storage files are modified.
CREATE OR REPLACE FUNCTION s08_private.can_read_legacy_file(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=''
AS $body$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND p_name IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM s08_private.storage_legacy_grants g
      JOIN public.garage_data d ON d.user_id=g.user_id
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
        CASE WHEN pg_catalog.jsonb_typeof(d.data->'workorders')='array'
          THEN d.data->'workorders' ELSE '[]'::jsonb END
      ) wo(value)
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
        CASE WHEN pg_catalog.jsonb_typeof(wo.value->'attachments')='array'
          THEN wo.value->'attachments' ELSE '[]'::jsonb END
      ) attachment(value)
      WHERE g.user_id=(SELECT auth.uid())
        AND g.object_name=p_name
        AND attachment.value->>'path'=p_name
    );
$body$;

REVOKE ALL ON FUNCTION s08_private.can_read_legacy_file(text)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION s08_private.can_read_legacy_file(text)
TO authenticated;
