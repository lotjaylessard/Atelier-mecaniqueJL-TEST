-- S08 TEST ONLY: apply preview guard to real *shapes* of active snapshots.
-- All transformations are ephemeral jsonb expressions. NO UPDATE / INSERT.
DO $audit$
DECLARE
  garages integer;
  allowed_notes integer;
  protected_candidates integer;
  blocked_tamper integer;
  archive_candidates integer;
  allowed_archive integer;
BEGIN
 WITH variants AS (
  SELECT
    d.data,
    jsonb_set(d.data,'{notes}',
      (d.data->'notes') || jsonb_build_array(
         jsonb_build_object('id','s08-audit-no-save')),false) AS notes_snapshot,
    (SELECT (ord-1)::int FROM jsonb_array_elements(d.data->'invoices')
       WITH ORDINALITY AS e(item,ord)
       WHERE item->>'status'='paid' OR item->>'archived'='true' LIMIT 1) AS paid_idx,
    (SELECT (ord-1)::int FROM jsonb_array_elements(d.data->'invoices')
       WITH ORDINALITY AS e(item,ord)
       WHERE item->>'status'='paid'
         AND item->>'archived' IS DISTINCT FROM 'true' LIMIT 1) AS archive_idx
  FROM public.garage_data d WHERE d.garage_id IS NOT NULL
 )
 SELECT count(*),
   count(*) FILTER(WHERE s08_private.preview_paid_invoice_integrity(data,notes_snapshot)),
   count(*) FILTER(WHERE paid_idx IS NOT NULL),
   count(*) FILTER(WHERE paid_idx IS NOT NULL AND NOT s08_private.preview_paid_invoice_integrity(
      data,jsonb_set(data,ARRAY['invoices',paid_idx::text,'total'],'999999'::jsonb,false))),
   count(*) FILTER(WHERE archive_idx IS NOT NULL),
   count(*) FILTER(WHERE archive_idx IS NOT NULL AND s08_private.preview_paid_invoice_integrity(
      data,
      jsonb_set(jsonb_set(data,ARRAY['invoices',archive_idx::text,'archived'],'true'::jsonb,true),
        ARRAY['invoices',archive_idx::text,'archivedDate'],'"2026-11-13"'::jsonb,true)))
 INTO garages,allowed_notes,protected_candidates,blocked_tamper,archive_candidates,allowed_archive
 FROM variants;

 IF garages=0 OR allowed_notes<>garages THEN
   RAISE EXCEPTION 'Normal unrelated data updates rejected by preview guard: % / %',allowed_notes,garages;
 END IF;
 IF protected_candidates=0 OR blocked_tamper<>protected_candidates THEN
   RAISE EXCEPTION 'Not all real paid/archived invoice tampering blocked: % / %',
      blocked_tamper,protected_candidates;
 END IF;
 IF archive_candidates>0 AND allowed_archive<>archive_candidates THEN
   RAISE EXCEPTION 'Normal archive rejected: % / %',allowed_archive,archive_candidates;
 END IF;
 RAISE NOTICE 'S08 snapshot-shaped preview checks succeeded, without any write';
END $audit$;