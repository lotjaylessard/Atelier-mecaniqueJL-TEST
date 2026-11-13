-- S08 owner isolation regression (TEST only). Read-only, no user data returned.
-- Execute with a database administrator in the dedicated TEST database.
-- Simulates three existing members as authenticated JWT principals.
-- This tests RLS at the database level, not full HTTP authentication.

BEGIN READ ONLY;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  (SELECT user_id::text FROM public.garage_members ORDER BY user_id OFFSET 0 LIMIT 1),
  true
);
SET LOCAL ROLE authenticated;
DO $check$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Missing test identity 1';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.garage_data WHERE user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Account 1 cannot read its own garage_data row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_data WHERE user_id<>auth.uid()) THEN
    RAISE EXCEPTION 'Account 1 can read another owner''s garage_data';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_quotes WHERE user_id<>auth.uid()) THEN
    RAISE EXCEPTION 'Account 1 can read another owner''s garage_quotes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_timer_sessions WHERE user_id<>auth.uid()) THEN
    RAISE EXCEPTION 'Account 1 can read another owner''s timer sessions';
  END IF;
  RAISE NOTICE 'Account 1: isolation checks passed';
END
$check$;
ROLLBACK;

BEGIN READ ONLY;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  (SELECT user_id::text FROM public.garage_members ORDER BY user_id OFFSET 1 LIMIT 1),
  true
);
SET LOCAL ROLE authenticated;
DO $check$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Missing test identity 2';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.garage_data WHERE user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Account 2 cannot read its own garage_data row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_data WHERE user_id<>auth.uid()) THEN
    RAISE EXCEPTION 'Account 2 can read another owner''s garage_data';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_quotes WHERE user_id<>auth.uid()) THEN
    RAISE EXCEPTION 'Account 2 can read another owner''s garage_quotes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_timer_sessions WHERE user_id<>auth.uid()) THEN
    RAISE EXCEPTION 'Account 2 can read another owner''s timer sessions';
  END IF;
  RAISE NOTICE 'Account 2: isolation checks passed';
END
$check$;
ROLLBACK;

BEGIN READ ONLY;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  (SELECT user_id::text FROM public.garage_members ORDER BY user_id OFFSET 2 LIMIT 1),
  true
);
SET LOCAL ROLE authenticated;
DO $check$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Missing test identity 3';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.garage_data WHERE user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Account 3 cannot read its own garage_data row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_data WHERE user_id<>auth.uid()) THEN
    RAISE EXCEPTION 'Account 3 can read another owner''s garage_data';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_quotes WHERE user_id<>auth.uid()) THEN
    RAISE EXCEPTION 'Account 3 can read another owner''s garage_quotes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_timer_sessions WHERE user_id<>auth.uid()) THEN
    RAISE EXCEPTION 'Account 3 can read another owner''s timer sessions';
  END IF;
  RAISE NOTICE 'Account 3: isolation checks passed';
END
$check$;
ROLLBACK;
