-- S08 TEST: Storage inventory assertions, read only, no binary files retrieved.
DO $audit$
DECLARE n integer; broken integer; metadata_bad integer; stale_grants integer;
BEGIN
 WITH refs AS (
  SELECT d.user_id,a.value->>'path' path FROM public.garage_data d
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.data->'workorders')='array' THEN d.data->'workorders' ELSE '[]'::jsonb END) w(value)
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(w.value->'attachments')='array' THEN w.value->'attachments' ELSE '[]'::jsonb END) a(value)
 ), matched AS (
  SELECT r.path,o.id,o.metadata FROM refs r LEFT JOIN storage.objects o ON o.bucket_id='wo-files' AND o.name=r.path
 )
 SELECT count(*), count(*) FILTER (WHERE id IS NULL OR nullif(btrim(path),'') IS NULL),
   count(*) FILTER (WHERE id IS NOT NULL AND
     (metadata IS NULL OR coalesce(metadata->>'size','') !~ '^[0-9]+$'
       OR nullif(btrim(metadata->>'mimetype'),'') IS NULL
       OR nullif(btrim(metadata->>'eTag'),'') IS NULL))
 INTO n,broken,metadata_bad FROM matched;
 IF broken<>0 OR metadata_bad<>0 THEN
  RAISE EXCEPTION 'Storage inventory failed: % broken references, % malformed metadata (% total)',broken,metadata_bad,n;
 END IF;
 SELECT count(*) INTO stale_grants FROM s08_private.storage_legacy_grants g
 WHERE NOT EXISTS (
  SELECT 1 FROM public.garage_data d
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.data->'workorders')='array' THEN d.data->'workorders' ELSE '[]'::jsonb END) w(value)
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(w.value->'attachments')='array' THEN w.value->'attachments' ELSE '[]'::jsonb END) a(value)
  WHERE d.user_id=g.user_id AND a.value->>'path'=g.object_name
 );
 IF stale_grants<>0 THEN RAISE EXCEPTION '% obsolete legacy grants',stale_grants; END IF;
 RAISE NOTICE 'S08 Storage metadata and legacy grants passed for % BT attachment references',n;
END $audit$;
