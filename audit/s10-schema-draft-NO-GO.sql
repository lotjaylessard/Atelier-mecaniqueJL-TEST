-- S10 PREPARATION ONLY. NE PAS EXECUTER SUR PROD.

-- Schéma de colonnes TEST, contraintes/RLS/index/triggers non inclus.

BEGIN;

CREATE TABLE IF NOT EXISTS public."garage_calendar_notes" (  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "garage_id" uuid NOT NULL,
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "note_date" date NOT NULL,
  "note_text" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."garage_calendar_notes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.garage_data ADD COLUMN IF NOT EXISTS garage_id uuid;

ALTER TABLE public.garage_data ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public."garage_external_calendar_connections" (  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "garage_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "calendar_id" text NOT NULL,
  "display_name" text DEFAULT ''::text NOT NULL,
  "sync_status" text DEFAULT 'not_connected'::text NOT NULL,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."garage_external_calendar_connections" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."garage_external_calendar_events" (  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL,
  "garage_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "provider_event_id" text NOT NULL,
  "event_title" text DEFAULT ''::text NOT NULL,
  "start_at" timestamp with time zone,
  "end_at" timestamp with time zone,
  "start_date" date,
  "end_date" date,
  "all_day" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "categories" jsonb DEFAULT '[]'::jsonb NOT NULL
);

ALTER TABLE public."garage_external_calendar_events" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."garage_external_calendar_tokens" (  "connection_id" uuid NOT NULL,
  "refresh_token_ciphertext" text NOT NULL,
  "refresh_token_nonce" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."garage_external_calendar_tokens" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."garage_external_oauth_states" (  "state_hash" text NOT NULL,
  "user_id" uuid NOT NULL,
  "garage_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "pkce_verifier" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

ALTER TABLE public."garage_external_oauth_states" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."garage_familywall_feed_secrets" (  "connection_id" uuid NOT NULL,
  "url_ciphertext" text NOT NULL,
  "url_nonce" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."garage_familywall_feed_secrets" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."garage_members" (  "garage_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'employee'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."garage_members" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."garage_quotes" (  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "garage_id" uuid NOT NULL,
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "quote_number" text DEFAULT ('SO-'::text || lpad((nextval('garage_quotes_number_seq'::regclass))::text, 4, '0'::text)) NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "content" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" bigint DEFAULT 0 NOT NULL,
  "converted_bt_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."garage_quotes" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."garage_schedule_events" (  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "garage_id" uuid NOT NULL,
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "visibility" text NOT NULL,
  "event_type" text NOT NULL,
  "title" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "all_day" boolean DEFAULT true NOT NULL,
  "start_time" time without time zone,
  "end_time" time without time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."garage_schedule_events" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."garage_timer_sessions" (  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "garage_id" uuid NOT NULL,
  "work_order_id" text NOT NULL,
  "status" text DEFAULT 'paused'::text NOT NULL,
  "confirmed_ms" bigint DEFAULT 0 NOT NULL,
  "last_heartbeat_at" timestamp with time zone,
  "revision" bigint DEFAULT 0 NOT NULL,
  "posted_labor_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "manual_adjusted_ms" bigint DEFAULT 0 NOT NULL
);

ALTER TABLE public."garage_timer_sessions" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public."garages" (  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."garages" ENABLE ROW LEVEL SECURITY;

-- STOP: NO COMMIT, cette ébauche est volontairement non exécutable sans contraintes et policies.

ROLLBACK;
