-- S10 phase 4 / isolated local restore ONLY: external calendar metadata.
-- NO TEST data, OAuth tokens, feed URLs or secrets are imported.
-- RLS is enabled without policies; local PostgreSQL cannot certify Supabase auth.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF current_database()<>'atelier_jl_restore_test' THEN RAISE EXCEPTION 'LOCAL RESTORE ONLY'; END IF;
 IF to_regclass('public.garage_schedule_events') IS NULL OR
    (SELECT count(*) FROM public.garage_data)<>1 OR
    (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')<>55
 THEN RAISE EXCEPTION 'Phase 3 prerequisites or original data mismatch'; END IF;
 IF to_regclass('public.garage_external_calendar_connections') IS NOT NULL OR
    to_regclass('public.garage_external_calendar_events') IS NOT NULL OR
    to_regclass('public.garage_external_calendar_tokens') IS NOT NULL OR
    to_regclass('public.garage_external_oauth_states') IS NOT NULL OR
    to_regclass('public.garage_familywall_feed_secrets') IS NOT NULL
 THEN RAISE EXCEPTION 'Calendar table already exists; no overwrite'; END IF;
END $$;
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
DO $$
BEGIN
 IF (SELECT count(*) FROM public.garage_data)<>1 OR
    (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')<>55
 THEN RAISE EXCEPTION 'Original data changed unexpectedly'; END IF;
END $$;
COMMIT;
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;
-- Expected 12 application tables total. SQL RPCs, grants, policies and Edge
-- Functions are NOT included; no production deployment authorized.
