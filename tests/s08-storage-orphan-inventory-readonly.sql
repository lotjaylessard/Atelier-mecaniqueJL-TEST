-- S08 TEST: non-destructive orphan-file inventory.
-- Old attachments can remain deliberately after BT removal.
-- This gate warns but NEVER deletes physical objects.
DO $audit$
DECLARE n_total integer; n_ref integer; n_unused integer; n_old integer;
BEGIN
 WITH referenced AS(
  SELECT DISTINCT attachment.value->>'path' path
  FROM public.garage_data gd
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(gd.data->'workorders')='array' THEN gd.data->'workorders' ELSE '[]'::jsonb END) wo(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(wo.value->'attachments')='array' THEN wo.value->'attachments' ELSE '[]'::jsonb END) attachment(value)
 )
 SELECT count(*),count(*) FILTER(WHERE r.path IS NOT NULL),
 count(*) FILTER(WHERE r.path IS NULL),
 count(*) FILTER(WHERE r.path IS NULL AND o.created_at<now()-interval '7 days')
 INTO n_total,n_ref,n_unused,n_old
 FROM storage.objects o LEFT JOIN referenced r ON r.path=o.name
 WHERE o.bucket_id='wo-files';
 IF n_total<n_ref OR n_total<n_unused OR n_total<>n_ref+n_unused THEN
   RAISE EXCEPTION 'BT Storage inventory invariant broken';
 END IF;
 RAISE NOTICE 'S08 Storage inventory: % objects, % referenced, % unreferenced, % unreferenced older than 7d. No deletion.',n_total,n_ref,n_unused,n_old;
END $audit$;