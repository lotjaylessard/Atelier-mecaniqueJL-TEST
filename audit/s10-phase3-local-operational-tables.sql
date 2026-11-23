-- S10 phase 3: isolated local functional tables from TEST catalog.
-- DO NOT RUN ON SUPABASE PROD OR TEST. This does not install RPCs or policies.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF current_database() <> 'atelier_jl_restore_test' THEN RAISE EXCEPTION 'LOCAL RESTORE ONLY'; END IF;
 IF to_regclass('public.garages') IS NULL OR to_regclass('public.garage_members') IS NULL
    OR (SELECT count(*) FROM public.garage_data) <> 1
    OR (SELECT count(*) FROM public.garages) <> 1
    OR (SELECT count(*) FROM public.garage_members WHERE role='owner') <> 1
 THEN RAISE EXCEPTION 'Phase 2 prerequisite not satisfied'; END IF;
 IF to_regclass('public.garage_quotes') IS NOT NULL
    OR to_regclass('public.garage_timer_sessions') IS NOT NULL
    OR to_regclass('public.garage_calendar_notes') IS NOT NULL
    OR to_regclass('public.garage_schedule_events') IS NOT NULL
 THEN RAISE EXCEPTION 'Target table already exists; no overwrite'; END IF;
END $$;
CREATE SEQUENCE public.garage_quotes_number_seq;
CREATE TABLE public.garage_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 garage_id uuid NOT NULL REFERENCES public.garages(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 quote_number text NOT NULL DEFAULT ('SO-' || lpad(nextval('public.garage_quotes_number_seq')::text,4,'0')),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','approved','declined','expired','converted')),
 content jsonb NOT NULL DEFAULT '{}'::jsonb,
 version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
 converted_bt_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT garage_quotes_number_format CHECK (quote_number ~ '^SO-([0-9]{4,}|[A-Z0-9]{1,12}-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4,})$'),
 CONSTRAINT garage_quotes_unique_number UNIQUE (garage_id,quote_number)
);
CREATE TABLE public.garage_timer_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 garage_id uuid NOT NULL REFERENCES public.garages(id) ON DELETE RESTRICT,
 work_order_id text NOT NULL CHECK (char_length(btrim(work_order_id)) BETWEEN 1 AND 120),
 status text NOT NULL DEFAULT 'paused' CHECK (status IN ('paused','running','posted')),
 confirmed_ms bigint NOT NULL DEFAULT 0 CHECK (confirmed_ms BETWEEN 0 AND 86400000000),
 last_heartbeat_at timestamptz,
 revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
 posted_labor_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 manual_adjusted_ms bigint NOT NULL DEFAULT 0 CHECK (manual_adjusted_ms >= 0),
 CONSTRAINT s06_timer_state CHECK (
 (status='running' AND last_heartbeat_at IS NOT NULL AND posted_labor_id IS NULL) OR
 (status='paused' AND last_heartbeat_at IS NULL AND posted_labor_id IS NULL) OR
 (status='posted' AND last_heartbeat_at IS NULL AND posted_labor_id IS NOT NULL))
);
CREATE TABLE public.garage_calendar_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 garage_id uuid NOT NULL,
 user_id uuid NOT NULL,
 note_date date NOT NULL,
 note_text text NOT NULL CHECK (char_length(btrim(note_text)) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.garage_schedule_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 garage_id uuid NOT NULL,
 user_id uuid NOT NULL,
 visibility text NOT NULL CHECK (visibility IN ('private','workshop')),
 event_type text NOT NULL CHECK (event_type IN ('unavailable','closed','reserved')),
 title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
 start_date date NOT NULL,
 end_date date NOT NULL,
 all_day boolean NOT NULL DEFAULT true,
 start_time time,
 end_time time,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT schedule_dates CHECK (end_date >= start_date),
 CONSTRAINT schedule_hours CHECK (
  (all_day=true AND start_time IS NULL AND end_time IS NULL) OR
  (all_day=false AND start_time IS NOT NULL AND end_time IS NOT NULL AND
    (end_date>start_date OR end_time>start_time))),
 CONSTRAINT schedule_visibility_kind CHECK (visibility <> 'private' OR event_type='unavailable')
);
ALTER TABLE public.garage_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_timer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_timer_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.garage_calendar_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_schedule_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.garage_data) <> 1 OR
    (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files') <> 55
 THEN RAISE EXCEPTION 'Existing production data changed unexpectedly'; END IF;
END $$;
COMMIT;
SELECT tablename, (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t.tablename) AS policies
FROM (VALUES ('garage_quotes'),('garage_timer_sessions'),('garage_calendar_notes'),('garage_schedule_events')) AS t(tablename);
-- Expected each policies=0: LOCAL TEST TABLES HAVE RLS ENABLED AND NO POLICIES.
-- Functions and Supabase auth roles must be deployed/tested separately in isolated Supabase.
