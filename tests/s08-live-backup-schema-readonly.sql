-- S08 TEST: validate export schema of active linked garage rows only.
-- Legacy unlinked garage_data is intentionally preserved and reported separately.
-- Read-only inspection; no customer records or contents are returned.
DO $audit$
DECLARE broken int; active int; legacy int;
BEGIN
 SELECT count(*),count(*) FILTER(WHERE NOT (
    jsonb_typeof(data->'clients')='array'
    AND jsonb_typeof(data->'invoices')='array'
    AND jsonb_typeof(data->'workorders')='array'
    AND jsonb_typeof(data->'notes')='array'
    AND jsonb_typeof(data->'links')='array'
    AND jsonb_typeof(data->'parts')='array'
    AND jsonb_typeof(data->'services')='array'
    AND jsonb_typeof(data->'settings')='object'
    AND (data->>'invoiceCounter') ~ '^[0-9]+$'
 )) INTO active,broken
 FROM public.garage_data WHERE garage_id IS NOT NULL;
 IF active=0 OR broken>0 THEN
  RAISE EXCEPTION 'Active garage export schema invalid: % broken of %',broken,active;
 END IF;
 SELECT count(*) INTO legacy FROM public.garage_data WHERE garage_id IS NULL;
 RAISE NOTICE 'S08 export schemas valid for % linked garages. % legacy unlinked snapshots preserved.',active,legacy;
END $audit$;