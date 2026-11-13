-- S08 TEST: read-only assertions that linked BT attachment objects
-- are not deletable or replaceable through normal authenticated Storage APIs.
-- No physical Storage file is read, replaced, moved or deleted.
DO $catalog$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n
 FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects'
 AND (
  (policyname='Garage files delete' AND cmd='DELETE'
    AND qual LIKE '%is_bt_attachment_referenced%'
    AND roles @> ARRAY['authenticated']::name[])
  OR
  (policyname='Garage files update' AND cmd='UPDATE'
    AND qual LIKE '%is_bt_attachment_referenced%'
    AND with_check LIKE '%is_bt_attachment_referenced%'
    AND roles @> ARRAY['authenticated']::name[])
 );
 IF n<>2 THEN RAISE EXCEPTION 'Storage mutation protection policies missing (% of 2)',n; END IF;
 IF has_function_privilege('anon',
   's08_private.is_bt_attachment_referenced(text)','EXECUTE')
 OR has_table_privilege('authenticated',
   's08_private.storage_legacy_grants','SELECT') THEN
   RAISE EXCEPTION 'Private Storage permissions are too permissive';
 END IF;
END $catalog$;

BEGIN READ ONLY;
SELECT set_config('request.jwt.claim.sub',
(SELECT user_id::text FROM public.garage_data
 WHERE garage_id IS NOT NULL ORDER BY user_id LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $actor$
DECLARE n integer; linked integer;
BEGIN
 WITH refs AS(
 SELECT a.value->>'path' path FROM public.garage_data d
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(d.data->'workorders')='array'
     THEN d.data->'workorders' ELSE '[]'::jsonb END) w(value)
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(w.value->'attachments')='array'
     THEN w.value->'attachments' ELSE '[]'::jsonb END) a(value)
 )
 SELECT count(*),
 count(*) FILTER(WHERE s08_private.is_bt_attachment_referenced(path))
 INTO n,linked FROM refs;
 IF n<1 OR n<>linked THEN
   RAISE EXCEPTION 'Linked physical files not protected (% of %)',linked,n;
 END IF;
 IF s08_private.is_bt_attachment_referenced('s08/no-such-object') THEN
   RAISE EXCEPTION 'Unknown unreferenced file flagged as a BT attachment';
 END IF;
 RAISE NOTICE 'S08 Storage delete/update policy guards verified for % linked references',n;
END $actor$;
ROLLBACK;