-- S10 / phase 1: LOCAL-ONLY additive compatibility columns.
-- This is NOT the complete multigarage migration. Do NOT run on Supabase PROD.
-- Tested target is a physical restore of PROD in PostgreSQL 17.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'atelier_jl_restore_test' THEN
    RAISE EXCEPTION 'REFUSED: local restore database required, found %', current_database();
  END IF;
  IF (SELECT count(*) FROM public.garage_data) <> 1 THEN
    RAISE EXCEPTION 'REFUSED: expected exactly one PROD garage_data row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_data WHERE data IS NULL) THEN
    RAISE EXCEPTION 'REFUSED: null garage JSON';
  END IF;
END $$;
-- The TEST schema has version bigint NOT NULL DEFAULT 0 and garage_id uuid NULL.
-- Do not assign garage_id until garages/membership mapping is verified.
ALTER TABLE public.garage_data
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.garage_data
  ADD COLUMN IF NOT EXISTS garage_id uuid;
-- Preserve the original owner PK, FK, JSONB and existing RLS policies.
-- No membership, quote, calendar, or Storage data from TEST is copied.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.garage_data) <> 1 THEN
    RAISE EXCEPTION 'REFUSED: row count changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_data WHERE version IS NULL) THEN
    RAISE EXCEPTION 'REFUSED: missing version';
  END IF;
END $$;
COMMIT;
SELECT count(*) AS garage_rows, count(*) FILTER (WHERE garage_id IS NULL) AS unmapped_garages,
       min(version) AS min_version, max(version) AS max_version
FROM public.garage_data;
-- Expected: garage_rows=1, unmapped_garages=1, min_version=max_version=0.
-- STOP HERE: garage_id mapping, FKs, RLS, triggers and other tables require phase 2.
