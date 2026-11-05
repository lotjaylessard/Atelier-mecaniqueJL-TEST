-- S06-F02 V2 — PROPOSITION NON EXECUTEE. SUPABASE TEST UNIQUEMENT.
-- NE PAS EXECUTER. Controles statiques seuls; RLS/requetes serveur NON testes.
-- Ce script remplace conceptuellement la V1, qui ne verifiait PAS les BT.
-- Ne modifie ni garage_data, ni garage_members, ni factures.
BEGIN;

CREATE TABLE public.garage_timer_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 garage_id uuid NOT NULL,
 work_order_id text NOT NULL CHECK (length(btrim(work_order_id)) BETWEEN 1 AND 120),
 status text NOT NULL DEFAULT 'paused' CHECK (status IN ('paused','running','posted')),
 confirmed_ms bigint NOT NULL DEFAULT 0 CHECK (confirmed_ms BETWEEN 0 AND 86400000000),
 last_heartbeat_at timestamptz,
 revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
 posted_labor_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT s06_timer_state CHECK (
  (status='running' AND last_heartbeat_at IS NOT NULL AND posted_labor_id IS NULL)
  OR (status='paused' AND last_heartbeat_at IS NULL AND posted_labor_id IS NULL)
  OR (status='posted' AND last_heartbeat_at IS NULL AND posted_labor_id IS NOT NULL)
 )
);

CREATE UNIQUE INDEX s06_timer_one_running_per_user
 ON public.garage_timer_sessions(user_id) WHERE status='running';
CREATE UNIQUE INDEX s06_timer_once_posted
 ON public.garage_timer_sessions(user_id,posted_labor_id)
 WHERE posted_labor_id IS NOT NULL;
CREATE INDEX s06_timer_user_work_order
 ON public.garage_timer_sessions(user_id,garage_id,work_order_id);
ALTER TABLE public.garage_timer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_timer_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.garage_timer_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.garage_timer_sessions TO authenticated;
CREATE POLICY s06_timer_select_own ON public.garage_timer_sessions
 FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

-- Validation serveur du BT, basee sur le JSON GARAGE existant.
-- Interne seulement : pas de permission d'execution aux roles API.
CREATE FUNCTION public.s06_timer_check_work_order(
 p_uid uuid, p_garage_id uuid, p_work_order_id text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
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

 SELECT gd.data INTO v_snapshot
 FROM public.garage_data gd WHERE gd.garage_id=p_garage_id;
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
$$;
REVOKE ALL ON FUNCTION public.s06_timer_check_work_order(uuid,uuid,text)
 FROM PUBLIC, anon, authenticated;

-- Actions transactionnelles uniquement. La session est attachee a un seul compte.
-- IMPORTANT : ni une facture ni un BT ne peuvent etre modifies par cette RPC.
CREATE FUNCTION public.s06_timer_transition(
 p_id uuid, p_action text, p_expected_revision bigint,
 p_work_order_id text DEFAULT NULL
) RETURNS public.garage_timer_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
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
   IF v_delta>20000 THEN
    v_rec.status:='paused';
    v_rec.last_heartbeat_at:=NULL;
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
$$;
REVOKE ALL ON FUNCTION public.s06_timer_transition(uuid,text,bigint,text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.s06_timer_transition(uuid,text,bigint,text)
 TO authenticated;

COMMIT;

-- VALIDATIONS BLOQUANTES AVANT EXECUTION SUR TEST :
-- Backup verified, ownership of routines and RLS, role-based negative tests,
-- SQL syntax review on disposable DB, and real multi-account concurrency tests.
-- NOTE: This version does not implement posting labor lines. No timer UI integration.
-- NOTE: existing garage_data stores the BT in JSON, so concurrent edits
--       still need explicit transaction consistency tests during S06-F05.
