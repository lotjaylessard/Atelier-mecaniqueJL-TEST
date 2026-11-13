-- S08 TEST — One-pass, read-only release integrity gate.
-- Never mutates customer rows, Storage, quotes, invoice amounts or login credentials.
DO $audit$
DECLARE
  active_owners integer;
  all_garages integer;
  bad_data integer;
  bad_refs integer;
  bad_quote_links integer;
  protected_files integer;
  total_files integer;
  policy_count integer;
BEGIN
 SELECT count(*) INTO active_owners FROM public.garage_data WHERE garage_id IS NOT NULL;
 SELECT count(*) INTO all_garages FROM public.garage_data;
 IF active_owners<1 OR all_garages<active_owners THEN
   RAISE EXCEPTION 'No active garage to validate';
 END IF;
 SELECT count(*) INTO bad_data FROM public.garage_data d
 WHERE d.garage_id IS NOT NULL
 AND NOT (
   jsonb_typeof(d.data->'clients')='array'
   AND jsonb_typeof(d.data->'invoices')='array'
   AND jsonb_typeof(d.data->'workorders')='array'
   AND jsonb_typeof(d.data->'notes')='array'
   AND jsonb_typeof(d.data->'links')='array'
   AND jsonb_typeof(d.data->'parts')='array'
   AND jsonb_typeof(d.data->'services')='array'
   AND jsonb_typeof(d.data->'settings')='object'
   AND d.data->>'invoiceCounter' ~ '^[0-9]+$'
 );
 IF bad_data<>0 THEN RAISE EXCEPTION '% active garage snapshots cannot be exported',bad_data; END IF;

 WITH refs AS(
  SELECT a.value->>'path' AS path
  FROM public.garage_data d
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(d.data->'workorders')='array'
      THEN d.data->'workorders' ELSE '[]'::jsonb END) w(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(w.value->'attachments')='array'
      THEN w.value->'attachments' ELSE '[]'::jsonb END) a(value)
  WHERE d.garage_id IS NOT NULL
 )
 SELECT count(*) FILTER(WHERE o.id IS NULL OR
     nullif(btrim(r.path),'') IS NULL OR
     coalesce(o.metadata->>'size','') !~ '^[0-9]+$'
   ),count(*)
 INTO bad_refs,total_files
 FROM refs r
 LEFT JOIN storage.objects o ON o.bucket_id='wo-files' AND o.name=r.path;
 IF bad_refs<>0 THEN RAISE EXCEPTION '% physical attachment references unresolved',bad_refs; END IF;
 SELECT count(*) INTO policy_count FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects'
 AND (
    (policyname='Garage files select' AND cmd='SELECT'
      AND qual LIKE '%can_read_legacy_file%')
    OR (policyname='Garage files delete' AND cmd='DELETE'
      AND qual LIKE '%is_bt_attachment_referenced%')
    OR (policyname='Garage files update' AND cmd='UPDATE'
      AND qual LIKE '%is_bt_attachment_referenced%'
      AND with_check LIKE '%is_bt_attachment_referenced%')
 );
 IF policy_count<>3 THEN
   RAISE EXCEPTION 'Incomplete Storage policy security gate: % of 3',policy_count;
 END IF;
 WITH converted AS(
 SELECT q.id,q.quote_number,q.converted_bt_id,d.data
 FROM public.garage_quotes q
 JOIN public.garage_data d ON d.garage_id=q.garage_id AND d.user_id=q.user_id
 WHERE q.converted_bt_id IS NOT NULL
 )
 SELECT count(*) INTO bad_quote_links FROM converted c WHERE NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(c.data->'workorders') w
  WHERE w->>'number'=c.converted_bt_id::text
   AND w->>'sourceQuoteId'=c.id::text
   AND w->>'sourceQuoteNumber'=c.quote_number
 );
 IF bad_quote_links<>0 THEN RAISE EXCEPTION '% converted SO/BT references invalid',bad_quote_links; END IF;
 IF has_function_privilege('authenticated',
      's08_private.preview_paid_invoice_integrity(jsonb,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'Unapproved invoice preview function unexpectedly exposed';
 END IF;
 IF EXISTS (SELECT 1 FROM public.garage_data d WHERE d.garage_id IS NOT NULL
   AND NOT s08_private.preview_paid_invoice_integrity(d.data,d.data)) THEN
   RAISE EXCEPTION 'Current snapshots rejected by experimental invoice validator';
 END IF;
 RAISE NOTICE 'S08 TEST read-only gate passed for % active garages and % BT attachments',active_owners,total_files;
END $audit$;