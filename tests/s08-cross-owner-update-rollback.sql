-- S08 TEST ONLY — cross-owner UPDATE regression.
-- The targeted row belongs to a different account; RLS must affect ZERO rows.
-- A no-op SET is used and all work is rolled back, including on success.
BEGIN;
SELECT pg_catalog.set_config('s08.audit.actor',(
  SELECT user_id::text FROM public.garage_data
  WHERE garage_id IS NOT NULL ORDER BY user_id LIMIT 1
),true);
SELECT pg_catalog.set_config('s08.audit.foreign',(
  SELECT garage_id::text FROM public.garage_data
  WHERE garage_id IS NOT NULL AND user_id<>(
    SELECT user_id FROM public.garage_data
    WHERE garage_id IS NOT NULL ORDER BY user_id LIMIT 1
  ) LIMIT 1
),true);
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',current_setting('s08.audit.actor'),true);
DO $audit$
DECLARE affected integer;
BEGIN
  IF nullif(current_setting('s08.audit.foreign',true),'') IS NULL
  THEN RAISE EXCEPTION 'Foreign garage test fixture unavailable'; END IF;
  UPDATE public.garage_data SET version=version
  WHERE garage_id=current_setting('s08.audit.foreign')::uuid;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN
    RAISE EXCEPTION 'Cross-owner garage_data UPDATE affected % rows',affected;
  END IF;
  RAISE NOTICE 'S08 cross-owner UPDATE blocked by RLS';
END $audit$;
ROLLBACK;
