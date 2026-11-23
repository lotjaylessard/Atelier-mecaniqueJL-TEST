-- S10 phase 2: LOCAL-ONLY garage identity + owner membership.
-- NEVER run against Supabase PROD. Do not copy TEST business data.
-- Supabase authenticated/anon roles and policies are intentionally NOT
-- created on plain Windows PostgreSQL. Security requires separate Supabase tests.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'atelier_jl_restore_test' THEN
    RAISE EXCEPTION 'REFUSED: expected isolated local database';
  END IF;
  IF (SELECT count(*) FROM public.garage_data) <> 1
     OR (SELECT count(*) FROM auth.users) <> 1 THEN
    RAISE EXCEPTION 'REFUSED: expected one existing garage and one auth user';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='garage_data' AND column_name='garage_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='garage_data' AND column_name='version'
  ) THEN
    RAISE EXCEPTION 'REFUSED: phase 1 not installed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_data WHERE garage_id IS NOT NULL) THEN
    RAISE EXCEPTION 'REFUSED: garage already mapped';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garage_data gd
             LEFT JOIN auth.users au ON au.id=gd.user_id WHERE au.id IS NULL) THEN
    RAISE EXCEPTION 'REFUSED: owner not present in auth.users';
  END IF;
  IF to_regclass('public.garages') IS NOT NULL
     OR to_regclass('public.garage_members') IS NOT NULL THEN
    RAISE EXCEPTION 'REFUSED: membership tables already exist; no automatic overwrite';
  END IF;
END $$;
CREATE TABLE public.garages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.garage_members (
  garage_id uuid NOT NULL REFERENCES public.garages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'employee'
    CHECK (role IN ('owner','admin','employee')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (garage_id,user_id)
);
CREATE INDEX garage_members_user_id_idx ON public.garage_members(user_id);
ALTER TABLE public.garages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_members ENABLE ROW LEVEL SECURITY;
-- Keep the existing garage_data user PK, user FK and JSONB intact.
-- New FK + unique match the TEST schema; no policy is modified here.
ALTER TABLE public.garage_data
  ADD CONSTRAINT garage_data_garage_id_fkey
  FOREIGN KEY (garage_id) REFERENCES public.garages(id);
ALTER TABLE public.garage_data
  ADD CONSTRAINT garage_data_garage_id_unique UNIQUE (garage_id);
WITH new_garage AS (
  INSERT INTO public.garages(name) VALUES ('Atelier Mécanique JL')
  RETURNING id
), linked AS (
  UPDATE public.garage_data gd SET garage_id=(SELECT id FROM new_garage)
  WHERE gd.garage_id IS NULL RETURNING gd.garage_id,gd.user_id
)
INSERT INTO public.garage_members(garage_id,user_id,role)
SELECT garage_id,user_id,'owner' FROM linked;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.garages) <> 1
     OR (SELECT count(*) FROM public.garage_members WHERE role='owner') <> 1
     OR (SELECT count(*) FROM public.garage_data WHERE garage_id IS NOT NULL) <> 1
     OR (SELECT count(*) FROM public.garage_data) <> 1 THEN
    RAISE EXCEPTION 'REFUSED: owner mapping failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.garage_data gd
    LEFT JOIN public.garage_members gm
      ON gm.garage_id=gd.garage_id AND gm.user_id=gd.user_id AND gm.role='owner'
    WHERE gm.user_id IS NULL
  ) THEN RAISE EXCEPTION 'REFUSED: garage owner mismatch'; END IF;
END $$;
COMMIT;
SELECT (SELECT count(*) FROM public.garage_data) AS garage_data_rows,
       (SELECT count(*) FROM public.garages) AS garages,
       (SELECT count(*) FROM public.garage_members WHERE role='owner') AS owners,
       (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files') AS storage_metadata;
-- Expected 1 | 1 | 1 | 55. RLS policies NOT validated here.
