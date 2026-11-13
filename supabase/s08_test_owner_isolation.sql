-- S08 TEST ONLY: align garage_data RLS with one-account/one-data ownership.
-- Existing owner policy "Garage owner access" remains intact.
-- No garage_data rows are changed.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='garage_data'
      AND policyname='Garage owner access'
      AND cmd='ALL'
      AND qual='(auth.uid() = user_id)'
      AND with_check='(auth.uid() = user_id)'
  ) THEN
    RAISE EXCEPTION 'Owner-only policy not found: refusing RLS change';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='garage_data'
      AND policyname='Garage members can read data'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='garage_data'
      AND policyname='Garage members can update data'
  ) THEN
    RAISE EXCEPTION 'Expected membership policies not found: refusing change';
  END IF;
END
$guard$;

DROP POLICY "Garage members can read data" ON public.garage_data;
DROP POLICY "Garage members can update data" ON public.garage_data;

-- The remaining owner policy protects SELECT/INSERT/UPDATE/DELETE through
-- USING and WITH CHECK auth.uid() = user_id.
