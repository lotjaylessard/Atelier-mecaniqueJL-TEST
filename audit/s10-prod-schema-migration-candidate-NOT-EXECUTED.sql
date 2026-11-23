-- S10 production-schema candidate (NOT APPROVED FOR EXECUTION).
-- Only creates schema/membership; never copies TEST data.
-- Run only after an up-to-date PROD backup and explicit user approval.
-- One transaction: any error rolls back all schema changes.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.garage_data') IS NULL OR to_regclass('auth.users') IS NULL
    OR to_regclass('storage.objects') IS NULL THEN
   RAISE EXCEPTION 'Missing Supabase production prerequisites';
 END IF;
 IF (SELECT count(*) FROM public.garage_data) <> 1 THEN
   RAISE EXCEPTION 'Expected one pre-migration owner record; stop';
 END IF;
 IF EXISTS (SELECT 1 FROM public.garage_data gd LEFT JOIN auth.users u ON u.id=gd.user_id WHERE u.id IS NULL OR gd.data IS NULL) THEN
   RAISE EXCEPTION 'Existing garage owner or JSON data invalid';
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='garage_data' AND column_name='garage_id') OR
    to_regclass('public.garages') IS NOT NULL OR to_regclass('public.garage_members') IS NOT NULL OR
    to_regclass('public.garage_quotes') IS NOT NULL OR
    to_regclass('public.garage_external_calendar_connections') IS NOT NULL THEN
   RAISE EXCEPTION 'Target already partially migrated; do not overwrite';
 END IF;
END $guard$;

-- Phase 1
ALTER TABLE public.garage_data
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.garage_data
  ADD COLUMN IF NOT EXISTS garage_id uuid;
-- Preserve the original owner PK, FK, JSONB and existing RLS policies.
-- No membership, quote, calendar, or Storage data from TEST is copied.

-- Phase 2
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

-- Phase 3
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

-- Phase 4
CREATE TABLE public.garage_external_calendar_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 garage_id uuid NOT NULL,
 user_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN ('google','microsoft','familywall')),
 calendar_id text NOT NULL CHECK(char_length(calendar_id) BETWEEN 1 AND 512),
 display_name text NOT NULL DEFAULT '',
 sync_status text NOT NULL DEFAULT 'not_connected' CHECK(sync_status IN ('not_connected','connected','syncing','needs_reconnect','error')),
 last_synced_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(garage_id,user_id,provider,calendar_id)
);
CREATE TABLE public.garage_external_calendar_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 connection_id uuid NOT NULL REFERENCES public.garage_external_calendar_connections(id) ON DELETE CASCADE,
 garage_id uuid NOT NULL,
 user_id uuid NOT NULL,
 provider_event_id text NOT NULL CHECK(char_length(provider_event_id) BETWEEN 1 AND 512),
 event_title text NOT NULL DEFAULT '',
 start_at timestamptz,
 end_at timestamptz,
 start_date date,
 end_date date,
 all_day boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 categories jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(categories)='array'),
 UNIQUE(connection_id,provider_event_id),
 CONSTRAINT valid_dates CHECK(start_date IS NULL OR end_date IS NULL OR end_date>=start_date),
 CONSTRAINT valid_times CHECK(start_at IS NULL OR end_at IS NULL OR end_at>=start_at)
);
CREATE TABLE public.garage_external_calendar_tokens (
 connection_id uuid PRIMARY KEY REFERENCES public.garage_external_calendar_connections(id) ON DELETE CASCADE,
 refresh_token_ciphertext text NOT NULL,
 refresh_token_nonce text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.garage_external_oauth_states (
 state_hash text PRIMARY KEY CHECK(length(state_hash)=64),
 user_id uuid NOT NULL,
 garage_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN ('google','microsoft')),
 pkce_verifier text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 CONSTRAINT oauth_state_expiry CHECK(expires_at>created_at)
);
CREATE TABLE public.garage_familywall_feed_secrets (
 connection_id uuid PRIMARY KEY REFERENCES public.garage_external_calendar_connections(id) ON DELETE CASCADE,
 url_ciphertext text NOT NULL,
 url_nonce text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.garage_external_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_external_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_external_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_external_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_familywall_feed_secrets ENABLE ROW LEVEL SECURITY;

DO $post$
BEGIN
 IF (SELECT count(*) FROM public.garage_data)<>1 OR
    (SELECT count(*) FROM public.garages)<>1 OR
    (SELECT count(*) FROM public.garage_members WHERE role='owner')<>1 OR
    EXISTS (SELECT 1 FROM public.garage_data gd
      LEFT JOIN public.garage_members gm ON gm.garage_id=gd.garage_id AND gm.user_id=gd.user_id AND gm.role='owner'
      WHERE gm.user_id IS NULL)
 THEN RAISE EXCEPTION 'Owner mapping invariant failed'; END IF;
END $post$;
COMMIT;
