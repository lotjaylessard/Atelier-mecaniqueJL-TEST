-- S10 ONE-TRANSACTION production migration candidate.
-- NOT APPROVED / NOT EXECUTED. Requires explicit owner authorization.
-- Never imports TEST business records, tokens, or files.
-- Prerequisite: fresh PROD backup and schema review. Supabase SQL editor compatible.
BEGIN;

-- ===== s10-prod-schema-migration-candidate-NOT-EXECUTED.sql =====
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

-- ===== s10-phase5-supabase-helper-timer-functions.sql =====

-- is_garage_member
CREATE OR REPLACE FUNCTION public.is_garage_member(p_garage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.garage_members AS gm
    WHERE gm.garage_id = p_garage_id
      AND gm.user_id = (SELECT auth.uid())
  );
$function$;

-- can_read_garage_file
CREATE OR REPLACE FUNCTION public.can_read_garage_file(file_owner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.garage_members as viewer
      join public.garage_members as owner_member
        on owner_member.garage_id = viewer.garage_id
      where viewer.user_id = auth.uid()
        and owner_member.user_id = file_owner_id
        and viewer.role in ('owner', 'employee')
        and owner_member.role in ('owner', 'employee')
    );
$function$;

-- protect_garage_data_ids
CREATE OR REPLACE FUNCTION public.protect_garage_data_ids()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.garage_id IS DISTINCT FROM OLD.garage_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION
      'Modification de garage_id ou user_id interdite';
  END IF;

  RETURN NEW;
END;
$function$;

-- s06_timer_check_work_order
CREATE OR REPLACE FUNCTION public.s06_timer_check_work_order(p_uid uuid, p_garage_id uuid, p_work_order_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_snapshot jsonb;
 v_wo jsonb;
 v_found int;
 v_number text;
BEGIN
 IF p_uid IS NULL OR p_garage_id IS NULL OR p_work_order_id IS NULL THEN RETURN false; END IF;
 IF p_uid IS DISTINCT FROM auth.uid() THEN RETURN false; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.garage_members gm
  WHERE gm.user_id=p_uid AND gm.garage_id=p_garage_id
 ) THEN RETURN false; END IF;

 -- Verrou PARTAGE sur le JSON : une facturation ou cloture concurrente
 -- (UPDATE garage_data) doit se serialiser avant/apres la validation.
 SELECT gd.data INTO v_snapshot
 FROM public.garage_data gd WHERE gd.garage_id=p_garage_id FOR SHARE;
 IF NOT FOUND OR jsonb_typeof(v_snapshot->'workorders')<>'array'
    OR jsonb_typeof(v_snapshot->'invoices')<>'array' THEN RETURN false; END IF;
 SELECT count(*), (jsonb_agg(wo.value)->0) INTO v_found,v_wo
 FROM jsonb_array_elements(v_snapshot->'workorders') AS wo(value)
 WHERE wo.value->>'id'=p_work_order_id;
 IF v_found<>1 OR v_wo->>'status'<>'en_cours' THEN RETURN false; END IF;
 v_number := v_wo->>'number';
 IF v_number IS NULL OR btrim(v_number)='' THEN RETURN false; END IF;
 SELECT count(*) INTO v_found
 FROM jsonb_array_elements(v_snapshot->'workorders') AS wo(value)
 WHERE wo.value->>'number'=v_number;
 IF v_found<>1 THEN RETURN false; END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(v_snapshot->'invoices') AS inv(value)
  WHERE inv.value->>'workOrderNumber'=v_number
 ) THEN RETURN false; END IF;
 RETURN true;
END;
$function$;

-- s06_timer_post_labor
CREATE OR REPLACE FUNCTION public.s06_timer_post_labor(p_session_id uuid, p_expected_revision bigint, p_expected_garage_version bigint, p_description text, p_hourly_rate numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_session public.garage_timer_sessions%ROWTYPE;
  v_garage_version bigint;
  v_snapshot jsonb;
  v_wo jsonb;
  v_wo_number text;
  v_wo_count integer;
  v_idx integer;
  v_labor jsonb;
  v_notes text;
  v_marker text;
  v_item jsonb;
  v_hours numeric;
  v_rate numeric;
  v_total numeric;
  v_note text;
  v_next jsonb;
  v_written integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE='42501';
  END IF;
  IF p_session_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
     OR p_expected_garage_version IS NULL OR p_expected_garage_version<0
     OR p_description IS NULL OR length(pg_catalog.btrim(p_description)) NOT BETWEEN 1 AND 2000
     OR p_hourly_rate IS NULL OR p_hourly_rate<0 OR p_hourly_rate>100000
  THEN
    RAISE EXCEPTION 'Arguments invalides' USING ERRCODE='22023';
  END IF;

  -- Meme verrou utilisateur que s06_timer_transition. Les deux RPC
  -- verrouillent ensuite la SESSION puis le SNAPSHOT dans le meme ordre.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_uid::text,606)
  );
  SELECT * INTO v_session
    FROM public.garage_timer_sessions
    WHERE id=p_session_id AND user_id=v_uid
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session inconnue ou non autorisee' USING ERRCODE='42501';
  END IF;
  IF v_session.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'Conflit de revision de session' USING ERRCODE='40001';
  END IF;
  IF v_session.status<>'paused' OR v_session.posted_labor_id IS NOT NULL
     OR v_session.last_heartbeat_at IS NOT NULL THEN
    RAISE EXCEPTION 'Minuterie non arretee ou deja transferee' USING ERRCODE='22023';
  END IF;
  IF v_session.confirmed_ms<=0 OR v_session.confirmed_ms>86400000000 THEN
    RAISE EXCEPTION 'Duree confirmee invalide' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.garage_members gm
    WHERE gm.user_id=v_uid AND gm.garage_id=v_session.garage_id
  ) THEN
    RAISE EXCEPTION 'Acces au garage refuse' USING ERRCODE='42501';
  END IF;

  -- Verrou exclusif du JSON : pas d'ecriture concurrente d'une facture ou BT.
  SELECT gd.data, gd.version INTO v_snapshot,v_garage_version
  FROM public.garage_data gd WHERE gd.garage_id=v_session.garage_id
  FOR UPDATE;
  IF NOT FOUND OR v_garage_version IS DISTINCT FROM p_expected_garage_version THEN
    RAISE EXCEPTION 'Conflit de version du garage' USING ERRCODE='40001';
  END IF;
  IF pg_catalog.jsonb_typeof(v_snapshot->'workorders')<>'array'
     OR pg_catalog.jsonb_typeof(v_snapshot->'invoices')<>'array' THEN
    RAISE EXCEPTION 'Donnees BT/factures invalides' USING ERRCODE='22023';
  END IF;

  SELECT pg_catalog.count(*)::integer,
         pg_catalog.min((w.ordinality-1)::integer)
    INTO v_wo_count,v_idx
  FROM pg_catalog.jsonb_array_elements(v_snapshot->'workorders')
       WITH ORDINALITY AS w(value,ordinality)
  WHERE w.value->>'id'=v_session.work_order_id;
  IF v_wo_count<>1 THEN
    RAISE EXCEPTION 'BT absent ou duplique' USING ERRCODE='22023';
  END IF;
  v_wo := v_snapshot#>ARRAY['workorders',v_idx::text];
  IF v_wo->>'status'<>'en_cours' THEN
    RAISE EXCEPTION 'Bon de travail termine ou archive' USING ERRCODE='22023';
  END IF;
  v_wo_number:=v_wo->>'number';
  IF v_wo_number IS NULL OR pg_catalog.btrim(v_wo_number)='' THEN
    RAISE EXCEPTION 'Numero de BT invalide' USING ERRCODE='22023';
  END IF;
  SELECT pg_catalog.count(*)::integer INTO v_wo_count
    FROM pg_catalog.jsonb_array_elements(v_snapshot->'workorders') AS w(value)
    WHERE w.value->>'number'=v_wo_number;
  IF v_wo_count<>1 THEN
    RAISE EXCEPTION 'Numero BT duplique' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_snapshot->'invoices') AS i(value)
    WHERE i.value->>'workOrderNumber'=v_wo_number
  ) THEN
    RAISE EXCEPTION 'Bon de travail deja facture' USING ERRCODE='22023';
  END IF;
  IF pg_catalog.jsonb_typeof(v_wo->'labor')<>'array' THEN
    RAISE EXCEPTION 'Main-d''oeuvre du BT invalide' USING ERRCODE='22023';
  END IF;
  v_labor:=v_wo->'labor';
  v_marker:='[S06 minuterie : '||v_session.id::text||']';
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_labor) AS l(value)
    WHERE l.value->>'timerSessionId'=v_session.id::text
  ) THEN
    RAISE EXCEPTION 'Ligne de minuterie deja presente' USING ERRCODE='23505';
  END IF;
  IF v_wo ? 'notes' AND pg_catalog.jsonb_typeof(v_wo->'notes')<>'string' THEN
    RAISE EXCEPTION 'Notes du BT invalides' USING ERRCODE='22023';
  END IF;
  v_notes:=COALESCE(v_wo->>'notes','');
  IF pg_catalog.strpos(v_notes,v_marker)>0 THEN
    RAISE EXCEPTION 'Note de minuterie deja presente' USING ERRCODE='23505';
  END IF;
  -- Conserver la precision de la duree pour la facturation et les factures.
  -- v_hours reste une quantite precise (12 decimales); l'UI affiche 2 decimales.
  v_hours:=pg_catalog.round(v_session.confirmed_ms::numeric / 3600000,12);
  IF v_hours<=0 THEN
    RAISE EXCEPTION 'Temps insuffisant pour facturation' USING ERRCODE='22023';
  END IF;
  v_rate:=pg_catalog.round(p_hourly_rate,2);
  -- IMPORTANT: calculer le montant depuis les millisecondes REELLES.
  -- Ne pas arrondir v_hours avant le montant (42s x 90$/h = 1,05$).
  v_total:=pg_catalog.round(v_session.confirmed_ms::numeric*v_rate/3600000,2);
  v_item:=pg_catalog.jsonb_build_object(
    'timerSessionId',v_session.id::text,
    'description',pg_catalog.btrim(p_description),
    'hours',v_hours,'rate',v_rate,'total',v_total,
    'confirmedMs',v_session.confirmed_ms,
    'actor_id',v_uid::text,
    'confirmed_at',v_now
  );
  v_note:=v_marker||pg_catalog.chr(10)
    ||'Date UTC : '||pg_catalog.to_char(v_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS')
    ||'Z'||pg_catalog.chr(10)
    ||'Compte auteur : '||v_uid::text||pg_catalog.chr(10)
    ||'Travail effectue : '||pg_catalog.btrim(p_description)||pg_catalog.chr(10)
    ||'Temps confirme : '||v_session.confirmed_ms::text||' ms'||pg_catalog.chr(10)
    ||'Main-d''oeuvre : '||pg_catalog.round(v_hours,2)::text||' h affichees ('||v_hours::text
    ||' h exactes) x '||v_rate::text
    ||' $/h = '||v_total::text||' $';
  v_wo:=pg_catalog.jsonb_set(v_wo,'{labor}',v_labor||pg_catalog.jsonb_build_array(v_item));
  v_wo:=pg_catalog.jsonb_set(v_wo,'{notes}',
    pg_catalog.to_jsonb(CASE WHEN pg_catalog.btrim(v_notes)=''
      THEN v_note ELSE pg_catalog.rtrim(v_notes)||pg_catalog.chr(10)||pg_catalog.chr(10)||v_note END));
  v_next:=pg_catalog.jsonb_set(v_snapshot,
    ARRAY['workorders',v_idx::text],v_wo);

  -- Deux ecritures dans UNE transaction PostgreSQL. Toute erreur annule les deux.
  UPDATE public.garage_data
  SET data=v_next, version=v_garage_version+1, updated_at=v_now
  WHERE garage_id=v_session.garage_id AND version=v_garage_version;
  GET DIAGNOSTICS v_written=ROW_COUNT;
  IF v_written<>1 THEN
    RAISE EXCEPTION 'Conflit ecriture du garage' USING ERRCODE='40001';
  END IF;

  UPDATE public.garage_timer_sessions
  SET status='posted', posted_labor_id=v_session.id::text,
      revision=v_session.revision+1, updated_at=v_now
  WHERE id=v_session.id AND user_id=v_uid AND revision=v_session.revision
    AND status='paused' AND posted_labor_id IS NULL;
  GET DIAGNOSTICS v_written=ROW_COUNT;
  IF v_written<>1 THEN
    RAISE EXCEPTION 'Conflit ecriture de la minuterie' USING ERRCODE='40001';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'session_id',v_session.id::text,
    'work_order_id',v_session.work_order_id,
    'work_order_number',v_wo_number,
    'garage_version',v_garage_version+1,
    'session_revision',v_session.revision+1,
    'posted_labor_id',v_session.id::text,
    'confirmed_ms',v_session.confirmed_ms,
    'hours',v_hours,'hourly_rate',v_rate,'total',v_total,
    'actor_id',v_uid::text,
    'confirmed_at',v_now
  );
END
$function$;

-- s06_timer_recover_with_adjustment
CREATE OR REPLACE FUNCTION public.s06_timer_recover_with_adjustment(p_session_id uuid, p_expected_revision bigint, p_extra_seconds integer)
 RETURNS garage_timer_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_row public.garage_timer_sessions%rowtype;
  v_gap_seconds bigint;
begin
  if v_uid is null then
    raise exception 'Authentification requise' using errcode='42501';
  end if;
  if p_session_id is null or p_expected_revision is null or p_expected_revision < 0
     or p_extra_seconds is null or p_extra_seconds < 1 or p_extra_seconds > 28800 then
    raise exception 'Paramètres invalides' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,606));
  select * into v_row from public.garage_timer_sessions
    where id=p_session_id and user_id=v_uid for update;
  if not found then
    raise exception 'Session introuvable' using errcode='42501';
  end if;
  if v_row.revision <> p_expected_revision then
    raise exception 'Session modifiée, recharge puis revérifie' using errcode='40001';
  end if;
  if v_row.status <> 'running' or v_row.last_heartbeat_at is null then
    raise exception 'Session non récupérable ou déjà récupérée' using errcode='22023';
  end if;
  if not public.s06_timer_check_work_order(v_uid,v_row.garage_id,v_row.work_order_id) then
    raise exception 'BT non modifiable' using errcode='42501';
  end if;
  v_gap_seconds := floor(extract(epoch from (v_now-v_row.last_heartbeat_at)))::bigint;
  if v_gap_seconds < 60 or p_extra_seconds > v_gap_seconds then
    raise exception 'Durée déclarée supérieure à la période disponible ou session encore active' using errcode='22023';
  end if;
  update public.garage_timer_sessions
    set status='paused',
        confirmed_ms=v_row.confirmed_ms + p_extra_seconds::bigint*1000,
        manual_adjusted_ms=v_row.manual_adjusted_ms + p_extra_seconds::bigint*1000,
        last_heartbeat_at=null,
        revision=v_row.revision+1,
        updated_at=v_now
    where id=p_session_id and user_id=v_uid
      and revision=p_expected_revision and status='running'
    returning * into v_row;
  if not found then
    raise exception 'Conflit de session, recharge' using errcode='40001';
  end if;
  return v_row;
end;
$function$;

-- s06_timer_transition
CREATE OR REPLACE FUNCTION public.s06_timer_transition(p_id uuid, p_action text, p_expected_revision bigint, p_work_order_id text DEFAULT NULL::text)
 RETURNS garage_timer_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_uid uuid := auth.uid();
 v_now timestamptz := clock_timestamp();
 v_garage_id uuid;
 v_rec public.garage_timer_sessions%ROWTYPE;
 v_stale public.garage_timer_sessions%ROWTYPE;
 v_delta bigint;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentification requise' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('create','start','heartbeat','pause','recover') THEN
  RAISE EXCEPTION 'Action interdite' USING ERRCODE='22023';
 END IF;
 -- Evite deux appareils qui demarrent simultanement (ou creates concurrentes).
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,606));

 IF p_action='create' THEN
  IF p_id IS NOT NULL OR p_expected_revision IS DISTINCT FROM 0
     OR p_work_order_id IS NULL OR length(btrim(p_work_order_id)) NOT BETWEEN 1 AND 120 THEN
   RAISE EXCEPTION 'Arguments invalides' USING ERRCODE='22023';
  END IF;
  -- Un seul garage par compte, conformement au contrat du logiciel actuel.
  SELECT (array_agg(gm.garage_id))[1] INTO v_garage_id
  FROM public.garage_members gm WHERE gm.user_id=v_uid
  HAVING count(DISTINCT gm.garage_id)=1;
  IF v_garage_id IS NULL OR NOT public.s06_timer_check_work_order(v_uid,v_garage_id,btrim(p_work_order_id)) THEN
   RAISE EXCEPTION 'BT non autorise ou non modifiable' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.garage_timer_sessions(user_id,garage_id,work_order_id,updated_at,created_at)
  VALUES(v_uid,v_garage_id,btrim(p_work_order_id),v_now,v_now)
  RETURNING * INTO v_rec;
  RETURN v_rec;
 END IF;

 IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_work_order_id IS NOT NULL THEN
  RAISE EXCEPTION 'ID, revision ou BT invalide' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_rec FROM public.garage_timer_sessions
 WHERE id=p_id AND user_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Session introuvable' USING ERRCODE='42501'; END IF;
 IF v_rec.revision<>p_expected_revision THEN
  RAISE EXCEPTION 'Version differente, recharger' USING ERRCODE='40001';
 END IF;
 IF v_rec.status='posted' THEN RAISE EXCEPTION 'Session deja transferee' USING ERRCODE='22023'; END IF;

 IF p_action='start' THEN
  IF v_rec.status<>'paused' THEN RAISE EXCEPTION 'Deja en cours' USING ERRCODE='22023'; END IF;
  IF NOT public.s06_timer_check_work_order(v_uid,v_rec.garage_id,v_rec.work_order_id) THEN
   RAISE EXCEPTION 'BT non modifiable' USING ERRCODE='42501';
  END IF;
  -- Une fermeture brutale peut laisser running. Pause seulement si >60 s sans heartbeat.
  SELECT * INTO v_stale FROM public.garage_timer_sessions AS x
   WHERE x.user_id=v_uid AND x.status='running' FOR UPDATE;
  IF FOUND THEN
   IF v_stale.last_heartbeat_at > v_now - interval '60 seconds' THEN
    RAISE EXCEPTION 'Une autre minuterie fonctionne deja' USING ERRCODE='23505';
   END IF;
   UPDATE public.garage_timer_sessions
      SET status='paused',last_heartbeat_at=NULL,revision=revision+1,updated_at=v_now
    WHERE id=v_stale.id AND user_id=v_uid AND status='running';
   -- N'ajoute jamais les minutes ecoulees depuis le dernier heartbeat.
  END IF;
  v_rec.status:='running';
  v_rec.last_heartbeat_at:=v_now;
 ELSIF p_action='heartbeat' OR p_action='pause' THEN
  IF v_rec.status<>'running' THEN RAISE EXCEPTION 'Session inactive' USING ERRCODE='22023'; END IF;
  -- Si le BT a ete termine/facture entretemps, mettre en pause sans rien facturer.
  IF NOT public.s06_timer_check_work_order(v_uid,v_rec.garage_id,v_rec.work_order_id) THEN
   v_rec.status:='paused';
   v_rec.last_heartbeat_at:=NULL;
  ELSE
   v_delta := floor(extract(epoch FROM (v_now-v_rec.last_heartbeat_at))*1000)::bigint;
   IF v_delta < 0 THEN RAISE EXCEPTION 'Horloge serveur invalide' USING ERRCODE='22023'; END IF;
   -- Seuil bref de reconnexion/veille, au-delà pause sans comptabiliser.
   IF v_delta>60000 THEN
    -- Ne PAS perdre le segment interrompu en le mettant en pause ici.
    -- Conserver running pour que le mécanicien puisse confirmer les minutes
    -- via s06_timer_recover_with_adjustment, sans double comptabilisation.
    RAISE EXCEPTION 'Interruption prolongée, utiliser Récupérer' USING ERRCODE='22023';
   ELSE
    v_rec.confirmed_ms:=v_rec.confirmed_ms+v_delta;
    IF p_action='pause' THEN
     v_rec.status:='paused';
     v_rec.last_heartbeat_at:=NULL;
    ELSE
     v_rec.last_heartbeat_at:=v_now;
    END IF;
   END IF;
  END IF;
 ELSIF p_action='recover' THEN
  IF v_rec.status<>'running' THEN RAISE EXCEPTION 'Session deja arretee' USING ERRCODE='22023'; END IF;
  IF v_rec.last_heartbeat_at > v_now - interval '60 seconds' THEN
   RAISE EXCEPTION 'Minuterie possiblement active sur un autre appareil' USING ERRCODE='22023';
  END IF;
  -- Recuperation explicite : ne compte aucun temps non confirme.
  v_rec.status:='paused';
  v_rec.last_heartbeat_at:=NULL;
 END IF;

 v_rec.updated_at:=v_now;
 v_rec.revision:=v_rec.revision+1;
 UPDATE public.garage_timer_sessions AS x
    SET status=v_rec.status, confirmed_ms=v_rec.confirmed_ms,
        last_heartbeat_at=v_rec.last_heartbeat_at,revision=v_rec.revision,updated_at=v_rec.updated_at
  WHERE x.id=v_rec.id AND x.user_id=v_uid AND x.revision=p_expected_revision
  RETURNING * INTO v_rec;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conflit de version' USING ERRCODE='40001'; END IF;
 RETURN v_rec;
END;
$function$;

REVOKE ALL ON FUNCTION public.is_garage_member(p_garage_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_garage_member(p_garage_id uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_garage_member(p_garage_id uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.can_read_garage_file(file_owner_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_garage_file(file_owner_id uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_read_garage_file(file_owner_id uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.protect_garage_data_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_garage_data_ids() FROM anon;
REVOKE ALL ON FUNCTION public.protect_garage_data_ids() FROM authenticated;

REVOKE ALL ON FUNCTION public.s06_timer_check_work_order(p_uid uuid, p_garage_id uuid, p_work_order_id text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.s06_timer_check_work_order(p_uid uuid, p_garage_id uuid, p_work_order_id text) FROM anon;
REVOKE ALL ON FUNCTION public.s06_timer_check_work_order(p_uid uuid, p_garage_id uuid, p_work_order_id text) FROM authenticated;

REVOKE ALL ON FUNCTION public.s06_timer_post_labor(p_session_id uuid, p_expected_revision bigint, p_expected_garage_version bigint, p_description text, p_hourly_rate numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.s06_timer_post_labor(p_session_id uuid, p_expected_revision bigint, p_expected_garage_version bigint, p_description text, p_hourly_rate numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.s06_timer_post_labor(p_session_id uuid, p_expected_revision bigint, p_expected_garage_version bigint, p_description text, p_hourly_rate numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.s06_timer_recover_with_adjustment(p_session_id uuid, p_expected_revision bigint, p_extra_seconds integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.s06_timer_recover_with_adjustment(p_session_id uuid, p_expected_revision bigint, p_extra_seconds integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.s06_timer_recover_with_adjustment(p_session_id uuid, p_expected_revision bigint, p_extra_seconds integer) TO authenticated;

REVOKE ALL ON FUNCTION public.s06_timer_transition(p_id uuid, p_action text, p_expected_revision bigint, p_work_order_id text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.s06_timer_transition(p_id uuid, p_action text, p_expected_revision bigint, p_work_order_id text) FROM anon;
GRANT EXECUTE ON FUNCTION public.s06_timer_transition(p_id uuid, p_action text, p_expected_revision bigint, p_work_order_id text) TO authenticated;

-- ===== s10-phase6-supabase-quotes-backup-functions.sql =====

-- backup_garage_member_ids
CREATE OR REPLACE FUNCTION public.backup_garage_member_ids(p_garage_id uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select m.user_id from public.garage_members m
 where m.garage_id=p_garage_id and exists(
  select 1 from public.garage_members own
  where own.garage_id=p_garage_id and own.user_id=(select auth.uid()) and own.role='owner'
 )
 order by m.user_id
$function$;

-- backup_garage_quotes
CREATE OR REPLACE FUNCTION public.backup_garage_quotes(p_garage_id uuid)
 RETURNS SETOF garage_quotes
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select q.* from public.garage_quotes q
 where q.garage_id=p_garage_id
 and exists (
  select 1 from public.garage_members m
  where m.garage_id=p_garage_id and m.user_id=(select auth.uid()) and m.role='owner'
 )
 order by q.created_at,q.id
$function$;

-- backup_garage_storage_paths
CREATE OR REPLACE FUNCTION public.backup_garage_storage_paths(p_garage_id uuid)
 RETURNS TABLE(object_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select o.name from storage.objects o
 where o.bucket_id='wo-files'
 and exists (
  select 1 from public.garage_members own
  where own.garage_id=p_garage_id and own.user_id=(select auth.uid()) and own.role='owner'
 )
 and (
  exists (
   select 1 from public.garage_members m
   where m.garage_id=p_garage_id
    and o.name like m.user_id::text || '/%'
  )
  or exists (
   select 1 from public.garage_data d
   cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(d.data->'workorders')='array'
    then d.data->'workorders' else '[]'::jsonb end
   ) w(value)
   cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(w.value->'attachments')='array'
    then w.value->'attachments' else '[]'::jsonb end
   ) a(value)
   where d.garage_id=p_garage_id and a.value->>'path'=o.name
  )
 )
 order by o.name
$function$;

-- s08_assign_quote_tracking_number
CREATE OR REPLACE FUNCTION public.s08_assign_quote_tracking_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  first_letters text;
BEGIN
  -- Uses the unique global sequence value already assigned by the column default.
  -- Never overwrites existing records; this is an INSERT trigger only.
  IF NEW.quote_number !~ '^SO-[0-9]{4,}$' THEN RETURN NEW; END IF;
  SELECT string_agg(left(word,1),'') INTO first_letters
  FROM regexp_split_to_table(trim(coalesce(NEW.content->>'clientName','')),'[[:space:]]+') AS word
  WHERE word<>'';
  first_letters:=left(regexp_replace(upper(coalesce(first_letters,'')),'[^A-Z0-9]','','g'),12);
  IF first_letters='' THEN RAISE EXCEPTION 'Client name required for quote number'; END IF;
  NEW.quote_number:='SO-'||first_letters||'-'||
    to_char(now() at time zone 'America/Toronto','YYYY-MM-DD')||'-'||
    substring(NEW.quote_number from 4);
  RETURN NEW;
END
$function$;

-- s08_check_bt_invoice_preflight
CREATE OR REPLACE FUNCTION public.s08_check_bt_invoice_preflight(p_garage_id uuid, p_workorder_id text, p_workorder_number text, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  g public.garage_data%rowtype;
  v_wo jsonb;
  v_matches int;
  v_invoice_number text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_workorder_id IS NULL OR trim(p_workorder_id)='' OR
     p_workorder_number IS NULL OR trim(p_workorder_number)='' OR
     p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Work order identity and expected version required';
  END IF;
  SELECT * INTO g FROM public.garage_data
  WHERE garage_id=p_garage_id AND user_id=v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Garage not accessible'; END IF;
  IF g.version<>p_expected_version THEN
    RAISE EXCEPTION 'Garage version changed: reload before completion';
  END IF;
  IF jsonb_typeof(g.data->'workorders')<>'array' OR
     jsonb_typeof(g.data->'invoices')<>'array' THEN
    RAISE EXCEPTION 'Garage workorders/invoices are malformed';
  END IF;
  SELECT count(*), max(value::text)::jsonb INTO v_matches,v_wo
  FROM jsonb_array_elements(g.data->'workorders')
  WHERE value->>'id'=p_workorder_id
    AND value->>'number'=p_workorder_number;
  IF v_matches<>1 THEN RAISE EXCEPTION 'Work order not uniquely found'; END IF;
  IF v_wo->>'status'<>'en_cours' THEN
    RAISE EXCEPTION 'Work order already completed or unavailable';
  END IF;
  IF p_workorder_number !~ '^BT' THEN
    RAISE EXCEPTION 'Invalid work order number';
  END IF;
  v_invoice_number:='FA'||substring(p_workorder_number from 3);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(g.data->'invoices') i
    WHERE i->>'workOrderNumber'=p_workorder_number
       OR i->>'number'=v_invoice_number
  ) THEN RAISE EXCEPTION 'Invoice already exists for this work order'; END IF;
  RETURN jsonb_build_object('ok',true,'workOrderNumber',p_workorder_number,
    'invoiceNumber',v_invoice_number,'garageVersion',g.version);
END
$function$;

-- s08_convert_quote_to_workorder
CREATE OR REPLACE FUNCTION public.s08_convert_quote_to_workorder(p_quote_id uuid, p_expected_quote_version bigint, p_expected_garage_version bigint, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_user uuid := auth.uid(); q public.garage_quotes%rowtype;
 g public.garage_data%rowtype;
 c jsonb; v jsonb; item jsonb;
 parts jsonb := '[]'::jsonb; labor jsonb := '[]'::jsonb;
 client_name text; vehicle_label text; initial_letters text; today_label text; prefix text;
 next_no integer := 1; candidate text; wo_id text; wo jsonb;
 total_cents numeric := 0; qty numeric; unit_cents numeric; row_cents numeric; calculated numeric;
 q_content jsonb; mismatch boolean; linked_client text; linked_vehicle text;
 cleaned_name text; cleaned_vehicle text; display_vehicle text;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_expected_quote_version is null or p_expected_garage_version is null then
   raise exception 'Expected versions required';
 end if;
 select * into q from public.garage_quotes
 where id=p_quote_id and user_id=v_user for update;
 if not found then raise exception 'Quote not accessible'; end if;
 if q.status='converted' then raise exception 'Quote already converted: %', q.converted_bt_id; end if;
 if q.status not in ('draft','sent') or q.version<>p_expected_quote_version then
   raise exception 'Quote not eligible or version mismatch';
 end if;
 if not exists(select 1 from public.garage_members
   where garage_id=q.garage_id and user_id=v_user) then
   raise exception 'Garage membership missing';
 end if;
 select * into g from public.garage_data
 where garage_id=q.garage_id for update;
 if not found or g.version<>p_expected_garage_version then
   raise exception 'Garage version mismatch: reload and retry';
 end if;
 if jsonb_typeof(g.data->'clients')<>'array' or
    jsonb_typeof(g.data->'workorders')<>'array' then
   raise exception 'Garage data malformed';
 end if;
 q_content:=q.content;
 if nullif(trim(coalesce(q_content->>'approvalConfirmedAt','')),'') is null then
   raise exception 'Client approval required before conversion';
 end if;
 linked_client:=q_content->>'linkedClientId';
 linked_vehicle:=q_content->>'linkedVehicleId';
 if linked_client is null or linked_vehicle is null or
    q_content->>'linkConfirmedAt' is null then
   raise exception 'Client/vehicle link not confirmed';
 end if;
 select value into c from jsonb_array_elements(g.data->'clients')
 where value->>'id'=linked_client limit 1;
 if c is null then raise exception 'Linked client no longer exists'; end if;
 if jsonb_typeof(c->'vehicles')<>'array' then raise exception 'Client vehicles invalid'; end if;
 select value into v from jsonb_array_elements(c->'vehicles')
 where value->>'id'=linked_vehicle limit 1;
 if v is null then raise exception 'Linked vehicle not owned by client'; end if;
 client_name:=trim(coalesce(nullif(c->>'name',''),concat_ws(' ',c->>'firstName',c->>'lastName')));
 if client_name='' or length(regexp_replace(coalesce(c->>'phone',''),'\D','','g'))<10
 then raise exception 'Linked client incomplete'; end if;
 if coalesce(v->>'year','') !~ '^\d{4}$' or (v->>'year')::int <1886
 or trim(coalesce(v->>'make',''))='' or trim(coalesce(v->>'model',''))=''
 or (trim(coalesce(v->>'vin',''))='' and trim(coalesce(v->>'plate',''))='')
 or coalesce(v->>'km','') !~ '^\d+$' then
   raise exception 'Linked vehicle incomplete';
 end if;
 cleaned_name:=lower(regexp_replace(client_name,'\s+',' ','g'));
 cleaned_vehicle:=lower(regexp_replace(coalesce(q_content->>'vehicleLabel',''),'\s+',' ','g'));
 display_vehicle:=concat_ws(' ',v->>'year',v->>'make',v->>'model');
 mismatch:=cleaned_name<>lower(regexp_replace(coalesce(q_content->>'clientName',''),'\s+',' ','g'))
   or cleaned_vehicle<>lower(regexp_replace(display_vehicle,'\s+',' ','g'));
 if mismatch and coalesce(q_content->>'linkAcknowledgedDifferences','false')<>'true'
 then raise exception 'Unacknowledged client or vehicle mismatch'; end if;
 if jsonb_typeof(q_content->'lines')<>'array' or jsonb_array_length(q_content->'lines')=0
 then raise exception 'Quote must contain lines'; end if;
 for item in select value from jsonb_array_elements(q_content->'lines') loop
   if item->>'type' not in ('part','labor','other') or
      trim(coalesce(item->>'description',''))='' then
      raise exception 'Invalid quote line';
   end if;
   begin
     qty:=(item->>'qty')::numeric;
     unit_cents:=(item->>'priceCents')::numeric;
     row_cents:=(item->>'amountCents')::numeric;
   exception when invalid_text_representation or numeric_value_out_of_range then
     raise exception 'Invalid line numbers';
   end;
   if qty<=0 or unit_cents<0 or row_cents<0 or
      unit_cents<>trunc(unit_cents) or row_cents<>trunc(row_cents)
      or round(qty*unit_cents)<>row_cents then
      raise exception 'Quote line arithmetic mismatch';
   end if;
   if item ? 'costCents' and (item->>'type'<>'part' or coalesce(item->>'costCents','') !~ '^[0-9]{1,12}$') then raise exception 'Invalid purchase cost in quote line'; end if;
   total_cents:=total_cents+row_cents;
   if item->>'type'='labor' then
      labor:=labor||jsonb_build_array(jsonb_build_object(
        'description',item->>'description','hours',qty,
        'rate',unit_cents/100,'total',row_cents/100));
   else
      parts:=parts||jsonb_build_array(jsonb_build_object(
        'name',item->>'description','number',case when item->>'type'='part' then left(coalesce(item->>'number',''),100) else '' end,'qty',qty,'cost',case when item->>'type'='part' and item ? 'costCents' then (item->>'costCents')::numeric / 100 else 0 end,
        'rate',unit_cents/100,'total',row_cents/100,
        'supplier',case when item->>'type'='part' then left(coalesce(item->>'supplier',''),80) else '' end));
   end if;
 end loop;
 if total_cents<>(q_content->>'totalCents')::numeric then
   raise exception 'Total mismatch';
 end if;
 if q.quote_number ~ '^SO-[A-Z0-9]{1,12}-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4,}$' then
   candidate:='BT-'||substring(q.quote_number from 4);
   if exists (select 1 from jsonb_array_elements(g.data->'workorders') x
              where x->>'number'=candidate) then
     raise exception 'Work order number already exists';
   end if;
 else
   -- Legacy quote numbers retain the existing work-order numbering rules.
   initial_letters:=upper(regexp_replace(client_name,'(?:^|\s)(\S)\S*','\1','g'));
   initial_letters:=regexp_replace(initial_letters,'[^A-Z0-9]','','g');
   if initial_letters='' then raise exception 'Invalid initials'; end if;
   today_label:=to_char(now() at time zone 'America/Toronto','YYYY-MM-DD');
   prefix:='BT-'||initial_letters||'-'||today_label||'-';
   select coalesce(max(substring(x->>'number' from length(prefix)+1)::int),0)+1 into next_no
   from jsonb_array_elements(g.data->'workorders') x
   where x->>'number' like prefix||'%' and
     substring(x->>'number' from length(prefix)+1) ~ '^\d+$';
   candidate:=prefix||next_no;
 end if;
 wo_id:=(floor(extract(epoch from clock_timestamp())*1000)::bigint)::text;
 while exists(select 1 from jsonb_array_elements(g.data->'workorders') x
              where x->>'id'=wo_id) loop
   wo_id:=(wo_id::bigint+1)::text;
 end loop;
 vehicle_label:=display_vehicle;
 wo:=jsonb_build_object(
   'id',wo_id,'number',candidate,'date',to_char(now() at time zone 'America/Toronto','YYYY-MM-DD HH24:MI:SS'),
   'clientId',c->'id','clientName',client_name,'vehicleId',v->'id',
   'vehicleLabel',vehicle_label,'vehicleSnapshot',jsonb_build_object(
     'year',v->>'year','make',v->>'make','model',v->>'model','trim',coalesce(v->>'trim',''),
     'color',coalesce(v->>'color',''),'engine',coalesce(v->>'engine',''),
     'transmission',coalesce(v->>'transmission',''),'drivetrain',coalesce(v->>'drivetrain',''),
     'fuel',coalesce(v->>'fuel',''),'tireSize',coalesce(v->>'tireSize',''),
     'plate',coalesce(v->>'plate',''),'vin',coalesce(v->>'vin','')),
   'vehicleKm',(v->>'km')::numeric,'description',coalesce(q_content->>'description',''),
   'notes','','attachments','[]'::jsonb,'status','en_cours',
   'parts',parts,'labor',labor,'estimateTotal',total_cents/100,
   'sourceQuoteNumber',q.quote_number,'sourceQuoteId',q.id::text,
   'scheduledAppointment',q_content->'appointment');
 if p_dry_run then
   return jsonb_build_object('dryRun',true,'quoteNumber',q.quote_number,
     'candidateWorkOrderNumber',candidate,'totalCents',total_cents,
     'garageVersion',g.version,'quoteVersion',q.version);
 end if;
 update public.garage_data set
   data=jsonb_set(g.data,'{workorders}',(g.data->'workorders')||jsonb_build_array(wo)),
   version=g.version+1,updated_at=now()
 where garage_id=g.garage_id and user_id=g.user_id and version=g.version;
 if not found then raise exception 'Garage concurrent modification'; end if;
 update public.garage_quotes set status='converted',converted_bt_id=candidate,
   content=q.content||jsonb_build_object('convertedWorkOrderId',wo_id,'convertedAt',now()),
   version=q.version+1,updated_at=now()
 where id=q.id and version=q.version and status in ('draft','sent');
 if not found then raise exception 'Quote concurrent modification'; end if;
 return jsonb_build_object('dryRun',false,'quoteNumber',q.quote_number,
   'workOrderNumber',candidate,'workOrderId',wo_id,
   'garageVersion',g.version+1,'quoteVersion',q.version+1);
end $function$;

-- s09_protect_quote_identity
CREATE OR REPLACE FUNCTION public.s09_protect_quote_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.id is distinct from old.id or
    new.garage_id is distinct from old.garage_id or
    new.user_id is distinct from old.user_id or
    new.created_at is distinct from old.created_at or
    new.quote_number is distinct from old.quote_number
 then
  raise exception 'Quote identity is immutable' using errcode='23514';
 end if;
 return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.backup_garage_member_ids(p_garage_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backup_garage_member_ids(p_garage_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.backup_garage_member_ids(p_garage_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.backup_garage_quotes(p_garage_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backup_garage_quotes(p_garage_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.backup_garage_quotes(p_garage_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.backup_garage_storage_paths(p_garage_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backup_garage_storage_paths(p_garage_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.backup_garage_storage_paths(p_garage_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.s08_assign_quote_tracking_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.s08_assign_quote_tracking_number() FROM anon;
GRANT EXECUTE ON FUNCTION public.s08_assign_quote_tracking_number() TO authenticated;

REVOKE ALL ON FUNCTION public.s08_check_bt_invoice_preflight(p_garage_id uuid, p_workorder_id text, p_workorder_number text, p_expected_version bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.s08_check_bt_invoice_preflight(p_garage_id uuid, p_workorder_id text, p_workorder_number text, p_expected_version bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.s08_check_bt_invoice_preflight(p_garage_id uuid, p_workorder_id text, p_workorder_number text, p_expected_version bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.s08_convert_quote_to_workorder(p_quote_id uuid, p_expected_quote_version bigint, p_expected_garage_version bigint, p_dry_run boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.s08_convert_quote_to_workorder(p_quote_id uuid, p_expected_quote_version bigint, p_expected_garage_version bigint, p_dry_run boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.s08_convert_quote_to_workorder(p_quote_id uuid, p_expected_quote_version bigint, p_expected_garage_version bigint, p_dry_run boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.s09_protect_quote_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.s09_protect_quote_identity() FROM anon;
GRANT EXECUTE ON FUNCTION public.s09_protect_quote_identity() TO authenticated;

-- ===== s10-phase7-rls-policies-staged.sql =====

DROP POLICY IF EXISTS "garage_calendar_notes_delete_own" ON public.garage_calendar_notes;
CREATE POLICY "garage_calendar_notes_delete_own" ON public.garage_calendar_notes AS PERMISSIVE FOR DELETE TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_calendar_notes.garage_id))))));

DROP POLICY IF EXISTS "garage_calendar_notes_insert_own" ON public.garage_calendar_notes;
CREATE POLICY "garage_calendar_notes_insert_own" ON public.garage_calendar_notes AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_calendar_notes.garage_id))))));

DROP POLICY IF EXISTS "garage_calendar_notes_read_own" ON public.garage_calendar_notes;
CREATE POLICY "garage_calendar_notes_read_own" ON public.garage_calendar_notes AS PERMISSIVE FOR SELECT TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_calendar_notes.garage_id))))));

DROP POLICY IF EXISTS "garage_calendar_notes_update_own" ON public.garage_calendar_notes;
CREATE POLICY "garage_calendar_notes_update_own" ON public.garage_calendar_notes AS PERMISSIVE FOR UPDATE TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_calendar_notes.garage_id))))))
WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_calendar_notes.garage_id))))));

DROP POLICY IF EXISTS "calendar_connections_select_owner" ON public.garage_external_calendar_connections;
CREATE POLICY "calendar_connections_select_owner" ON public.garage_external_calendar_connections AS PERMISSIVE FOR SELECT TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_external_calendar_connections.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "calendar_events_select_owner" ON public.garage_external_calendar_events;
CREATE POLICY "calendar_events_select_owner" ON public.garage_external_calendar_events AS PERMISSIVE FOR SELECT TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_external_calendar_connections c
  WHERE ((c.id = garage_external_calendar_events.connection_id) AND (c.user_id = garage_external_calendar_events.user_id) AND (c.garage_id = garage_external_calendar_events.garage_id)))) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_external_calendar_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Members can read own membership" ON public.garage_members;
CREATE POLICY "Members can read own membership" ON public.garage_members AS PERMISSIVE FOR SELECT TO authenticated
USING ((user_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "quotes_delete_own" ON public.garage_quotes;
CREATE POLICY "quotes_delete_own" ON public.garage_quotes AS PERMISSIVE FOR DELETE TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_quotes.garage_id))))));

DROP POLICY IF EXISTS "quotes_insert_own" ON public.garage_quotes;
CREATE POLICY "quotes_insert_own" ON public.garage_quotes AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_quotes.garage_id))))));

DROP POLICY IF EXISTS "quotes_read_same_garage" ON public.garage_quotes;
CREATE POLICY "quotes_read_same_garage" ON public.garage_quotes AS PERMISSIVE FOR SELECT TO authenticated
USING (((garage_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_quotes.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.role = ANY (ARRAY['owner'::text, 'employee'::text])))))));

DROP POLICY IF EXISTS "quotes_update_same_garage" ON public.garage_quotes;
CREATE POLICY "quotes_update_same_garage" ON public.garage_quotes AS PERMISSIVE FOR UPDATE TO authenticated
USING (((garage_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_quotes.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.role = ANY (ARRAY['owner'::text, 'employee'::text])))))))
WITH CHECK (((garage_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_quotes.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.role = ANY (ARRAY['owner'::text, 'employee'::text])))))));

DROP POLICY IF EXISTS "schedule_events_delete" ON public.garage_schedule_events;
CREATE POLICY "schedule_events_delete" ON public.garage_schedule_events AS PERMISSIVE FOR DELETE TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_schedule_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "schedule_events_insert" ON public.garage_schedule_events;
CREATE POLICY "schedule_events_insert" ON public.garage_schedule_events AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_schedule_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "schedule_events_read" ON public.garage_schedule_events;
CREATE POLICY "schedule_events_read" ON public.garage_schedule_events AS PERMISSIVE FOR SELECT TO authenticated
USING ((((visibility = 'private'::text) AND (user_id = ( SELECT auth.uid() AS uid))) OR ((visibility = 'workshop'::text) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_schedule_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS "schedule_events_update" ON public.garage_schedule_events;
CREATE POLICY "schedule_events_update" ON public.garage_schedule_events AS PERMISSIVE FOR UPDATE TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_schedule_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))))
WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_schedule_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "s06_timer_select_own" ON public.garage_timer_sessions;
CREATE POLICY "s06_timer_select_own" ON public.garage_timer_sessions AS PERMISSIVE FOR SELECT TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_timer_sessions.garage_id))))));

DROP POLICY IF EXISTS "Members can read their garages" ON public.garages;
CREATE POLICY "Members can read their garages" ON public.garages AS PERMISSIVE FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM garage_members
  WHERE ((garage_members.garage_id = garages.id) AND (garage_members.user_id = ( SELECT auth.uid() AS uid))))));

-- ===== s10-phase8-performance-and-unique-indexes.sql =====

CREATE INDEX IF NOT EXISTS garage_calendar_notes_owner_day_idx ON public.garage_calendar_notes USING btree (garage_id, user_id, note_date, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS garage_data_garage_id_unique ON public.garage_data USING btree (garage_id);

CREATE INDEX IF NOT EXISTS gce_owner_idx ON public.garage_external_calendar_connections USING btree (garage_id, user_id);

CREATE INDEX IF NOT EXISTS gee_owner_range_idx ON public.garage_external_calendar_events USING btree (garage_id, user_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS garage_oauth_states_expire ON public.garage_external_oauth_states USING btree (expires_at);

CREATE INDEX IF NOT EXISTS garage_members_user_id_idx ON public.garage_members USING btree (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS garage_quotes_unique_number ON public.garage_quotes USING btree (garage_id, quote_number);

CREATE INDEX IF NOT EXISTS schedule_events_scope_idx ON public.garage_schedule_events USING btree (garage_id, start_date, end_date);

CREATE UNIQUE INDEX IF NOT EXISTS s06_timer_once_posted ON public.garage_timer_sessions USING btree (user_id, posted_labor_id) WHERE (posted_labor_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS s06_timer_one_running_per_user ON public.garage_timer_sessions USING btree (user_id) WHERE (status = 'running'::text);

CREATE INDEX IF NOT EXISTS s06_timer_user_work_order ON public.garage_timer_sessions USING btree (user_id, garage_id, work_order_id);

-- ===== s10-phase9-identity-triggers.sql =====
DROP TRIGGER IF EXISTS protect_garage_data_ids_trigger ON public.garage_data;
CREATE TRIGGER protect_garage_data_ids_trigger BEFORE UPDATE ON public.garage_data FOR EACH ROW EXECUTE FUNCTION public.protect_garage_data_ids();
DROP TRIGGER IF EXISTS s08_assign_quote_tracking_number_before_insert ON public.garage_quotes;
CREATE TRIGGER s08_assign_quote_tracking_number_before_insert BEFORE INSERT ON public.garage_quotes FOR EACH ROW EXECUTE FUNCTION public.s08_assign_quote_tracking_number();
DROP TRIGGER IF EXISTS s09_quote_identity_immutable ON public.garage_quotes;
CREATE TRIGGER s09_quote_identity_immutable BEFORE UPDATE ON public.garage_quotes FOR EACH ROW EXECUTE FUNCTION public.s09_protect_quote_identity();

-- ===== s10-candidate-invoice-owner-rpc.sql =====
CREATE OR REPLACE FUNCTION public.s10_finalize_bt_invoice_owner_candidate(p_garage_id uuid, p_workorder_id text, p_workorder_number text, p_expected_version bigint, p_invoice jsonb, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g public.garage_data%rowtype; wo jsonb; src jsonb; dst jsonb;
 ix integer:=0; line_amount numeric; expected_sum numeric:=0;
 subtotal numeric; taxable numeric; discount_amount numeric;
 gst_amount numeric; qst_amount numeric; grand_total numeric;
 gst_rate numeric; qst_rate numeric; expected_gst numeric; expected_qst numeric;
BEGIN
 -- S10 candidate: owner-only multi-garage authorization, no TEST UUIDs.
 -- SECURITY INVOKER: the authenticated owner must own the garage_data row.
 IF auth.uid() IS NULL OR p_garage_id IS NULL THEN
   RAISE EXCEPTION 'Authentication and garage required';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.garage_members gm
   JOIN public.garage_data gd ON gd.garage_id=gm.garage_id
   WHERE gm.garage_id=p_garage_id
     AND gm.user_id=auth.uid()
     AND gm.role='owner'
     AND gd.user_id=auth.uid()
 ) THEN
   RAISE EXCEPTION 'Garage owner authorization required';
 END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT * INTO g FROM public.garage_data
 WHERE garage_id=p_garage_id AND user_id=auth.uid();
 IF NOT FOUND OR g.version IS DISTINCT FROM p_expected_version
 THEN RAISE EXCEPTION 'Garage missing or version changed'; END IF;
 SELECT value INTO wo FROM jsonb_array_elements(g.data->'workorders')
 WHERE value->>'id'=p_workorder_id AND value->>'number'=p_workorder_number;
 IF wo IS NULL OR wo->>'status'<>'en_cours' THEN
 RAISE EXCEPTION 'Work order missing or completed'; END IF;
 IF jsonb_typeof(wo->'parts')<>'array' OR jsonb_typeof(wo->'labor')<>'array'
 OR jsonb_typeof(p_invoice->'items')<>'array'
 THEN RAISE EXCEPTION 'Invalid line arrays'; END IF;
 IF p_invoice->>'customer' IS DISTINCT FROM wo->>'clientName' OR
 p_invoice->>'vehicle' IS DISTINCT FROM wo->>'vehicleLabel'
 THEN RAISE EXCEPTION 'Invoice customer or vehicle mismatch'; END IF;
 IF jsonb_array_length(p_invoice->'items')<>
 jsonb_array_length(wo->'parts')+jsonb_array_length(wo->'labor')
 THEN RAISE EXCEPTION 'Invoice line count mismatch'; END IF;
 FOR src IN SELECT value FROM jsonb_array_elements(wo->'parts') LOOP
 dst:=p_invoice->'items'->ix;
 IF dst->>'type' IS DISTINCT FROM 'Pièce' OR
 dst->>'desc' IS DISTINCT FROM src->>'name' OR
 coalesce(dst->>'number','') IS DISTINCT FROM coalesce(src->>'number','') OR
 coalesce(dst->>'qty','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 coalesce(dst->>'rate','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 coalesce(src->>'qty','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 coalesce(src->>'rate','') !~ '^[0-9]+(\.[0-9]+)?$'
 THEN RAISE EXCEPTION 'Invoice part line mismatch'; END IF;
 IF (dst->>'qty')::numeric<>(src->>'qty')::numeric OR
 (dst->>'rate')::numeric<>(src->>'rate')::numeric
 THEN RAISE EXCEPTION 'Invoice part quantity or rate mismatch'; END IF;
 line_amount:=(src->>'qty')::numeric*(src->>'rate')::numeric;
 IF coalesce(dst->>'total','') !~ '^[0-9]+([.][0-9]+)?$' OR
    abs((dst->>'total')::numeric-line_amount)>0.011
 THEN RAISE EXCEPTION 'Part line total mismatch'; END IF;
 expected_sum:=expected_sum+line_amount;
 ix:=ix+1;
 END LOOP;
 FOR src IN SELECT value FROM jsonb_array_elements(wo->'labor') LOOP
 dst:=p_invoice->'items'->ix;
 IF dst->>'type' IS DISTINCT FROM 'Main-d''œuvre' OR
 dst->>'desc' IS DISTINCT FROM src->>'description' OR
 coalesce(dst->>'qty','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 coalesce(dst->>'rate','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 coalesce(src->>'hours','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 coalesce(src->>'rate','') !~ '^[0-9]+(\.[0-9]+)?$'
 THEN RAISE EXCEPTION 'Invoice labor line mismatch'; END IF;
 IF (dst->>'qty')::numeric<>(src->>'hours')::numeric OR
 (dst->>'rate')::numeric<>(src->>'rate')::numeric
 THEN RAISE EXCEPTION 'Invoice labor quantity or rate mismatch'; END IF;
 line_amount:=(src->>'hours')::numeric*(src->>'rate')::numeric;
 IF nullif(src->>'timerSessionId','') IS NOT NULL AND
 coalesce(src->>'confirmedMs','') ~ '^[0-9]+(\.[0-9]+)?$' AND
 coalesce(src->>'total','') ~ '^[0-9]+(\.[0-9]+)?$' THEN
 IF dst->>'timerSessionId' IS DISTINCT FROM src->>'timerSessionId' OR
 dst->>'confirmedMs' IS DISTINCT FROM src->>'confirmedMs'
 THEN RAISE EXCEPTION 'Timer line mismatch'; END IF;
 line_amount:=(src->>'total')::numeric;
 END IF;
 IF coalesce(dst->>'total','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 abs((dst->>'total')::numeric-line_amount)>0.011
 THEN RAISE EXCEPTION 'Labor line amount mismatch'; END IF;
 expected_sum:=expected_sum+line_amount;ix:=ix+1;
 END LOOP;
 IF coalesce(p_invoice->>'subTotal','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 coalesce(p_invoice->>'discount','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 coalesce(p_invoice->>'taxableSubTotal','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 coalesce(p_invoice->>'gst','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 coalesce(p_invoice->>'qst','') !~ '^[0-9]+(\.[0-9]+)?$' OR
 coalesce(p_invoice->>'total','') !~ '^[0-9]+(\.[0-9]+)?$'
 THEN RAISE EXCEPTION 'Invalid invoice amounts'; END IF;
 subtotal:=(p_invoice->>'subTotal')::numeric;
 discount_amount:=(p_invoice->>'discount')::numeric;
 taxable:=(p_invoice->>'taxableSubTotal')::numeric;
 gst_amount:=(p_invoice->>'gst')::numeric;
 qst_amount:=(p_invoice->>'qst')::numeric;
 grand_total:=(p_invoice->>'total')::numeric;
 -- An invoice created automatically from a BT has no initial discount.
 -- Discounts may be applied later via the normal invoice editing controls.
 IF discount_amount<>0 OR coalesce(p_invoice->>'discountValue','0') NOT IN ('0','0.0','0.00')
 THEN RAISE EXCEPTION 'Unexpected discount on newly generated invoice'; END IF;
 IF discount_amount>subtotal OR
 abs(subtotal-round(expected_sum,2))>0.011 OR
 abs(taxable-round(subtotal-discount_amount,2))>0.011 OR
 abs(grand_total-round(taxable+gst_amount+qst_amount,2))>0.011
 THEN RAISE EXCEPTION 'Invoice totals mismatch'; END IF;
 IF jsonb_typeof(g.data->'settings')<>'object' OR
    coalesce(g.data->'settings'->>'gst','') !~ '^[0-9]+([.][0-9]+)?$' OR
    coalesce(g.data->'settings'->>'qst','') !~ '^[0-9]+([.][0-9]+)?$'
 THEN RAISE EXCEPTION 'Garage tax rates unavailable'; END IF;
 gst_rate:=(g.data->'settings'->>'gst')::numeric;
 qst_rate:=(g.data->'settings'->>'qst')::numeric;
 IF gst_rate>100 OR qst_rate>100 THEN RAISE EXCEPTION 'Garage tax rates invalid'; END IF;
 expected_gst:=CASE WHEN p_invoice->>'applyGST'='false' THEN 0
   ELSE round(taxable*gst_rate/100,2) END;
 expected_qst:=CASE WHEN p_invoice->>'applyQST'='false' THEN 0
   ELSE round(taxable*qst_rate/100,2) END;
 IF abs(gst_amount-expected_gst)>0.011 OR
    abs(qst_amount-expected_qst)>0.011 THEN
   RAISE EXCEPTION 'Invoice tax amounts differ from garage settings';
 END IF;

 DECLARE
  v_user uuid := auth.uid();
  g public.garage_data%rowtype;
  wo jsonb; expected_invoice text;
  existing_count integer;
  new_workorders jsonb;
  new_clients jsonb;
  new_data jsonb;
  client_rec jsonb;
  vehicle_rec jsonb;
  new_vehicles jsonb;
  current_km numeric;
  snapshot_km numeric;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_garage_id IS NULL OR p_workorder_id IS NULL OR trim(p_workorder_id)='' OR
    p_workorder_number IS NULL OR trim(p_workorder_number)='' OR
    p_expected_version IS NULL OR p_expected_version<0 THEN
   RAISE EXCEPTION 'Required work order identity/version missing';
 END IF;
 SELECT * INTO g FROM public.garage_data
 WHERE garage_id=p_garage_id AND user_id=v_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Garage not accessible'; END IF;
 IF g.version<>p_expected_version THEN RAISE EXCEPTION 'Garage version changed: reload first'; END IF;
 IF jsonb_typeof(g.data->'workorders')<>'array' OR
    jsonb_typeof(g.data->'invoices')<>'array' OR
    jsonb_typeof(g.data->'clients')<>'array' THEN
   RAISE EXCEPTION 'Invalid garage arrays';
 END IF;
 SELECT count(*), max(value::text)::jsonb INTO existing_count,wo
 FROM jsonb_array_elements(g.data->'workorders')
 WHERE value->>'id'=p_workorder_id AND value->>'number'=p_workorder_number;
 IF existing_count<>1 THEN RAISE EXCEPTION 'Work order not uniquely found'; END IF;
 IF wo->>'status'<>'en_cours' THEN RAISE EXCEPTION 'Work order already completed'; END IF;
 IF nullif(wo->>'clientId','') IS NULL OR nullif(wo->>'vehicleId','') IS NULL
 THEN RAISE EXCEPTION 'Linked client and vehicle required'; END IF;
 -- KM saisi à la fermeture : sauvegardé atomiquement sur le BT et le véhicule.
 IF coalesce(p_invoice->>'vehicleKm','') !~ '^[0-9]+([.][0-9]+)?$' OR
    (p_invoice->>'vehicleKm')::numeric <= 0
 THEN RAISE EXCEPTION 'Final invoice odometer missing or invalid'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(g.data->'workorders') w
     WHERE w->>'number'=p_workorder_number)<>1 THEN
   RAISE EXCEPTION 'Duplicate work order number';
 END IF;
 IF p_workorder_number !~ '^BT' THEN RAISE EXCEPTION 'Work order number malformed'; END IF;
 expected_invoice:='FA'||substring(p_workorder_number from 3);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(g.data->'invoices') i
  WHERE i->>'workOrderNumber'=p_workorder_number OR i->>'number'=expected_invoice)
 THEN RAISE EXCEPTION 'Invoice already exists'; END IF;
 -- Date.now() IDs must be present, numeric and unique in this garage.
 IF jsonb_typeof(p_invoice)<>'object' OR
    jsonb_typeof(p_invoice->'id') IS DISTINCT FROM 'number' OR
    coalesce(p_invoice->>'id','') !~ '^[0-9]{1,16}$' OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(g.data->'invoices') existing
      WHERE existing->>'id'=p_invoice->>'id') THEN
   RAISE EXCEPTION 'Invoice ID invalid or already used';
 END IF;
 IF jsonb_typeof(p_invoice)<>'object' OR
    p_invoice->>'number' IS DISTINCT FROM expected_invoice OR
    p_invoice->>'workOrderNumber' IS DISTINCT FROM p_workorder_number OR
    p_invoice->>'status' IS DISTINCT FROM 'unpaid' OR
    coalesce(p_invoice->>'paidAmount','0') NOT IN ('0','0.0','0.00') OR
    coalesce(p_invoice->>'archived','false')='true' OR
    coalesce(p_invoice->>'paidDate','')<>'' OR
    jsonb_typeof(p_invoice->'items')<>'array' OR
    (p_invoice ? 'payments' AND (jsonb_typeof(p_invoice->'payments')<>'array' OR
       jsonb_array_length(p_invoice->'payments')<>0)) THEN
   RAISE EXCEPTION 'Invalid newly created invoice';
 END IF;
 -- Le KM final de la facture remplace le KM ancien enregistré sur le BT.
 -- Le refus d'une diminution utilise le KM du véhicule actuel.
 IF jsonb_array_length(p_invoice->'items') <>
    coalesce(jsonb_array_length(wo->'parts'),0)+coalesce(jsonb_array_length(wo->'labor'),0)
 THEN RAISE EXCEPTION 'Invoice lines differ from work order'; END IF;
 -- Keep the latest client/vehicle odometer within the SAME transaction.
 new_clients := g.data->'clients';
 IF wo ? 'clientId' AND wo ? 'vehicleId' THEN
    snapshot_km := (p_invoice->>'vehicleKm')::numeric;
    SELECT value INTO client_rec FROM jsonb_array_elements(new_clients)
      WHERE value->>'id'=wo->>'clientId' LIMIT 1;
    IF client_rec IS NULL OR jsonb_typeof(client_rec->'vehicles')<>'array' THEN
      RAISE EXCEPTION 'Linked client missing or vehicles invalid';
    END IF;
    IF client_rec IS NOT NULL AND jsonb_typeof(client_rec->'vehicles')='array' THEN
      SELECT value INTO vehicle_rec FROM jsonb_array_elements(client_rec->'vehicles')
        WHERE value->>'id'=wo->>'vehicleId' LIMIT 1;
      IF vehicle_rec IS NULL THEN RAISE EXCEPTION 'Linked vehicle not found'; END IF;
      IF vehicle_rec IS NOT NULL THEN
        IF coalesce(vehicle_rec->>'km','0') !~ '^[0-9]+([.][0-9]+)?$' THEN
          RAISE EXCEPTION 'Invalid stored odometer';
        END IF;
        current_km:=(coalesce(vehicle_rec->>'km','0'))::numeric;
        IF snapshot_km<current_km THEN RAISE EXCEPTION 'Odometer decreased'; END IF;
        new_vehicles := (SELECT coalesce(jsonb_agg(
          CASE WHEN v->>'id'=wo->>'vehicleId' THEN
            jsonb_set(v,'{km}',to_jsonb(snapshot_km),true) ELSE v END ORDER BY n),'[]'::jsonb)
          FROM jsonb_array_elements(client_rec->'vehicles') WITH ORDINALITY a(v,n));
        new_clients := (SELECT coalesce(jsonb_agg(
          CASE WHEN c->>'id'=wo->>'clientId' THEN
            jsonb_set(c,'{vehicles}',new_vehicles,true) ELSE c END ORDER BY n),'[]'::jsonb)
          FROM jsonb_array_elements(new_clients) WITH ORDINALITY a(c,n));
      END IF;
    END IF;
 END IF;
 IF p_dry_run IS DISTINCT FROM false THEN
   RETURN jsonb_build_object('dryRun',true,'workOrderNumber',p_workorder_number,
      'invoiceNumber',expected_invoice,'garageVersion',g.version);
 END IF;
 new_workorders := (SELECT coalesce(jsonb_agg(
   CASE WHEN w->>'id'=p_workorder_id AND w->>'number'=p_workorder_number THEN
     w||jsonb_build_object('status','termine','vehicleKm',snapshot_km,'completedAt',
       to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   ELSE w END ORDER BY n),'[]'::jsonb)
   FROM jsonb_array_elements(g.data->'workorders') WITH ORDINALITY a(w,n));
 new_data := jsonb_set(jsonb_set(jsonb_set(g.data,'{workorders}',new_workorders),
    '{invoices}',(g.data->'invoices')||jsonb_build_array(p_invoice)),
    '{clients}',new_clients);
 UPDATE public.garage_data SET data=new_data,version=g.version+1,updated_at=now()
 WHERE garage_id=g.garage_id AND user_id=v_user AND version=g.version;
 IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent garage update'; END IF;
 RETURN jsonb_build_object('dryRun',false,'workOrderNumber',p_workorder_number,
  'invoiceNumber',expected_invoice,'garageVersion',g.version+1);
END;
END $function$;

REVOKE ALL ON FUNCTION public.s10_finalize_bt_invoice_owner_candidate(uuid,text,text,bigint,jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.s10_finalize_bt_invoice_owner_candidate(uuid,text,text,bigint,jsonb,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.s10_finalize_bt_invoice_owner_candidate(uuid,text,text,bigint,jsonb,boolean) TO authenticated;

-- ===== s10-phase10-api-table-grants.sql =====
REVOKE ALL ON TABLE public.garages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garages TO authenticated;
REVOKE ALL ON TABLE public.garage_members FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_members TO authenticated;
REVOKE ALL ON TABLE public.garage_quotes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_quotes TO authenticated;
REVOKE ALL ON TABLE public.garage_timer_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_timer_sessions TO authenticated;
REVOKE ALL ON TABLE public.garage_calendar_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_calendar_notes TO authenticated;
REVOKE ALL ON TABLE public.garage_schedule_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_schedule_events TO authenticated;
REVOKE ALL ON TABLE public.garage_external_calendar_connections FROM anon;
GRANT SELECT ON TABLE public.garage_external_calendar_connections TO authenticated;
REVOKE ALL ON TABLE public.garage_external_calendar_events FROM anon;
GRANT SELECT ON TABLE public.garage_external_calendar_events TO authenticated;
REVOKE ALL ON TABLE public.garage_external_calendar_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.garage_external_oauth_states FROM anon, authenticated;
REVOKE ALL ON TABLE public.garage_familywall_feed_secrets FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.garage_quotes_number_seq FROM anon;
GRANT USAGE ON SEQUENCE public.garage_quotes_number_seq TO authenticated;

-- Preserve one preexisting garage row and its owner mapping.
DO $s10$
BEGIN
 IF (SELECT count(*) FROM public.garage_data)<>1 OR
    (SELECT count(*) FROM public.garages)<>1 OR
    (SELECT count(*) FROM public.garage_members WHERE role='owner')<>1 OR
    (SELECT count(*) FROM public.garage_data WHERE data IS NULL OR garage_id IS NULL)<>0
 THEN RAISE EXCEPTION 'S10 postcondition failed: original owner mapping'; END IF;
END $s10$;
COMMIT;
