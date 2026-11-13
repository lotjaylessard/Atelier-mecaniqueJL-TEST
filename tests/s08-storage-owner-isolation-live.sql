-- S08 TEST: read-only Storage/RLS regression after owner-only migration.
-- Never downloads, modifies, deletes or copies physical files.
-- Three existing users are simulated using JWT claims and authenticated role.
DO $catalog$
BEGIN
  IF (SELECT count(*) FROM s08_private.storage_legacy_grants)<>1 THEN
    RAISE EXCEPTION 'Audited legacy file grants changed unexpectedly';
  END IF;
  IF pg_catalog.has_table_privilege('authenticated',
     's08_private.storage_legacy_grants','SELECT') THEN
    RAISE EXCEPTION 'Private legacy grants table directly exposed';
  END IF;
  IF pg_catalog.has_function_privilege('anon',
     's08_private.can_read_legacy_file(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous access to legacy file helper';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies p
    WHERE p.schemaname='storage' AND p.tablename='objects'
    AND p.policyname='Garage files select'
    AND p.cmd='SELECT'
    AND p.qual LIKE '%s08_private.can_read_legacy_file%'
    AND p.qual NOT LIKE '%can_read_garage_file%') THEN
    RAISE EXCEPTION 'Owner-only Storage SELECT policy missing';
  END IF;
END
$catalog$;

BEGIN READ ONLY;
SELECT pg_catalog.set_config('request.jwt.claim.sub',(
 SELECT user_id::text FROM public.garage_members ORDER BY user_id
 OFFSET 0 LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $audit$
DECLARE
  unapproved integer;
  refs integer;
  accessible integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Missing simulated account 1'; END IF;
  SELECT count(*) INTO unapproved FROM storage.objects
  WHERE bucket_id='wo-files'
    AND split_part(name,'/',1)<>auth.uid()::text
    AND NOT s08_private.can_read_legacy_file(name);
  IF unapproved<>0 THEN
    RAISE EXCEPTION 'Account 1 sees % unapproved other-owner files',unapproved;
  END IF;
  WITH refs AS (
    SELECT a.value->>'path' path
    FROM public.garage_data d
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(d.data->'workorders')='array'
      THEN d.data->'workorders' ELSE '[]'::jsonb END) w(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(w.value->'attachments')='array'
      THEN w.value->'attachments' ELSE '[]'::jsonb END) a(value)
    WHERE d.user_id=auth.uid()
  )
  SELECT count(*),count(o.id) INTO refs,accessible
  FROM refs r LEFT JOIN storage.objects o
    ON o.bucket_id='wo-files' AND o.name=r.path;
  IF refs<>accessible THEN
    RAISE EXCEPTION 'Account 1: % of % BT references inaccessible',
      refs-accessible,refs;
  END IF;
  RAISE NOTICE 'Account 1 Storage isolation and BT references passed';
END
$audit$;
ROLLBACK;

BEGIN READ ONLY;
SELECT pg_catalog.set_config('request.jwt.claim.sub',(
 SELECT user_id::text FROM public.garage_members ORDER BY user_id
 OFFSET 1 LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $audit$
DECLARE
  unapproved integer;
  refs integer;
  accessible integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Missing simulated account 2'; END IF;
  SELECT count(*) INTO unapproved FROM storage.objects
  WHERE bucket_id='wo-files'
    AND split_part(name,'/',1)<>auth.uid()::text
    AND NOT s08_private.can_read_legacy_file(name);
  IF unapproved<>0 THEN
    RAISE EXCEPTION 'Account 2 sees % unapproved other-owner files',unapproved;
  END IF;
  WITH refs AS (
    SELECT a.value->>'path' path
    FROM public.garage_data d
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(d.data->'workorders')='array'
      THEN d.data->'workorders' ELSE '[]'::jsonb END) w(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(w.value->'attachments')='array'
      THEN w.value->'attachments' ELSE '[]'::jsonb END) a(value)
    WHERE d.user_id=auth.uid()
  )
  SELECT count(*),count(o.id) INTO refs,accessible
  FROM refs r LEFT JOIN storage.objects o
    ON o.bucket_id='wo-files' AND o.name=r.path;
  IF refs<>accessible THEN
    RAISE EXCEPTION 'Account 2: % of % BT references inaccessible',
      refs-accessible,refs;
  END IF;
  RAISE NOTICE 'Account 2 Storage isolation and BT references passed';
END
$audit$;
ROLLBACK;

BEGIN READ ONLY;
SELECT pg_catalog.set_config('request.jwt.claim.sub',(
 SELECT user_id::text FROM public.garage_members ORDER BY user_id
 OFFSET 2 LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $audit$
DECLARE
  unapproved integer;
  refs integer;
  accessible integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Missing simulated account 3'; END IF;
  SELECT count(*) INTO unapproved FROM storage.objects
  WHERE bucket_id='wo-files'
    AND split_part(name,'/',1)<>auth.uid()::text
    AND NOT s08_private.can_read_legacy_file(name);
  IF unapproved<>0 THEN
    RAISE EXCEPTION 'Account 3 sees % unapproved other-owner files',unapproved;
  END IF;
  WITH refs AS (
    SELECT a.value->>'path' path
    FROM public.garage_data d
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(d.data->'workorders')='array'
      THEN d.data->'workorders' ELSE '[]'::jsonb END) w(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(w.value->'attachments')='array'
      THEN w.value->'attachments' ELSE '[]'::jsonb END) a(value)
    WHERE d.user_id=auth.uid()
  )
  SELECT count(*),count(o.id) INTO refs,accessible
  FROM refs r LEFT JOIN storage.objects o
    ON o.bucket_id='wo-files' AND o.name=r.path;
  IF refs<>accessible THEN
    RAISE EXCEPTION 'Account 3: % of % BT references inaccessible',
      refs-accessible,refs;
  END IF;
  RAISE NOTICE 'Account 3 Storage isolation and BT references passed';
END
$audit$;
ROLLBACK;
