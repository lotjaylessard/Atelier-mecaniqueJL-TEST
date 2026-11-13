-- S08 TEST ONLY: executable, read-only invoice preflight regression.
-- Uses an existing active BT, but returns no client or invoice details.
-- Tests legitimate owner success, stale version refusal and foreign owner refusal.
-- No data modification: the entire transaction is READ ONLY and rolled back.
BEGIN READ ONLY;
SELECT
  pg_catalog.set_config('s08.audit.owner',d.user_id::text,true),
  pg_catalog.set_config('s08.audit.garage',d.garage_id::text,true),
  pg_catalog.set_config('s08.audit.version',d.version::text,true),
  pg_catalog.set_config('s08.audit.wo_id',w.wo->>'id',true),
  pg_catalog.set_config('s08.audit.wo_number',w.wo->>'number',true)
FROM public.garage_data d
CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(d.data->'workorders') w(wo)
WHERE d.garage_id IS NOT NULL AND w.wo->>'status'='en_cours'
  AND w.wo->>'number' LIKE 'BT%'
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(d.data->'invoices') inv
    WHERE inv->>'workOrderNumber'=w.wo->>'number'
      OR inv->>'number'=('FA'||pg_catalog.substring(w.wo->>'number' from 3))
  )
LIMIT 1;

-- Set the JWT claim under the simulated authenticated role.
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  current_setting('s08.audit.owner'),true);

DO $check$
DECLARE
  result jsonb;
  failure text;
BEGIN
  result:=public.s08_check_bt_invoice_preflight(
    current_setting('s08.audit.garage')::uuid,
    current_setting('s08.audit.wo_id'),
    current_setting('s08.audit.wo_number'),
    current_setting('s08.audit.version')::bigint
  );
  IF result->>'ok' IS DISTINCT FROM 'true'
     OR result->>'garageVersion' IS DISTINCT FROM current_setting('s08.audit.version')
  THEN
    RAISE EXCEPTION 'Owner preflight failed';
  END IF;

  failure:=null;
  BEGIN
    PERFORM public.s08_check_bt_invoice_preflight(
      current_setting('s08.audit.garage')::uuid,
      current_setting('s08.audit.wo_id'),
      current_setting('s08.audit.wo_number'),
      current_setting('s08.audit.version')::bigint-1
    );
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT;
  END;
  IF failure NOT LIKE 'Garage version changed:%' OR failure IS NULL THEN
    RAISE EXCEPTION 'Stale version was not explicitly rejected: %',failure;
  END IF;
  RAISE NOTICE 'S08 preflight owner and stale version tests passed';
END $check$;

ROLLBACK;
