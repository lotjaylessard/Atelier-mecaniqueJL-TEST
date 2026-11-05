-- OBSOLETE / REMPLACEE PAR audit/S06-F02-V2-BT-verification-NE-PAS-EXECUTER.sql
-- NE PAS EXECUTER : la V1 ne verifie pas l'appartenance ni l'etat du BT cote serveur.
-- S06-F02 — PROPOSITION UNIQUEMENT — NE PAS EXECUTER SANS AUDIT SUPABASE TEST.
-- Nouvelle table isolee : ne change aucune table ni aucun JSON existant.
-- Ne contient ni nom de client ni tarif, seulement identifiants et duree.
-- Exiger des tests reels de RLS et de verrouillage avant activation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.garage_timer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  work_order_id text NOT NULL CHECK (length(btrim(work_order_id)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'paused'
    CHECK (status IN ('paused', 'running', 'posted')),
  confirmed_ms bigint NOT NULL DEFAULT 0
    CHECK (confirmed_ms >= 0 AND confirmed_ms <= 86400000000),
  last_heartbeat_at timestamptz,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  posted_labor_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT s06_timer_consistency CHECK (
    (status='running' AND last_heartbeat_at IS NOT NULL AND posted_labor_id IS NULL)
    OR (status='paused' AND last_heartbeat_at IS NULL AND posted_labor_id IS NULL)
    OR (status='posted' AND last_heartbeat_at IS NULL AND posted_labor_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS s06_timer_one_running_per_user
  ON public.garage_timer_sessions(user_id)
  WHERE status='running';

CREATE UNIQUE INDEX IF NOT EXISTS s06_timer_once_posted
  ON public.garage_timer_sessions(user_id, posted_labor_id)
  WHERE posted_labor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS s06_timer_user_wo
  ON public.garage_timer_sessions(user_id,work_order_id);

ALTER TABLE public.garage_timer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_timer_sessions FORCE ROW LEVEL SECURITY;

-- Aucun acces public, aucun droit d'ecriture directe des comptes utilisateurs.
REVOKE ALL ON TABLE public.garage_timer_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.garage_timer_sessions TO authenticated;

DROP POLICY IF EXISTS s06_timer_select_own ON public.garage_timer_sessions;
CREATE POLICY s06_timer_select_own ON public.garage_timer_sessions
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

-- Toutes les mutations passent par une seule RPC transactionnelle :
--  * Verrou exclusif par utilisateur (evite double demarrage multi-appareils)
--  * Verrou ligne + revision CAS stricte
--  * Horloge du serveur; heartbeat limite a 20 secondes
--  * Si trop de temps ecoule (page fermee/crash/onglet suspendu),
--    mise en pause SANS rajouter ce temps incertain
--  * Pas de mutation des factures ni des bons de travail.
CREATE OR REPLACE FUNCTION public.s06_timer_transition(
  p_id uuid, p_action text, p_expected_revision bigint,
  p_work_order_id text DEFAULT NULL
)
RETURNS public.garage_timer_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_rec public.garage_timer_sessions%ROWTYPE;
  v_delta bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('create','start','heartbeat','pause','recover') THEN
    RAISE EXCEPTION 'Action non autorisee' USING ERRCODE='22023';
  END IF;

  -- Tous les appels du meme utilisateur sont serialises, y compris CREATE.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 606));

  IF p_action='create' THEN
    IF p_id IS NOT NULL OR p_expected_revision IS DISTINCT FROM 0 OR
       p_work_order_id IS NULL OR length(btrim(p_work_order_id)) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Arguments de creation invalides' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.garage_timer_sessions(user_id,work_order_id,created_at,updated_at)
    VALUES(v_uid,btrim(p_work_order_id),v_now,v_now)
    RETURNING * INTO v_rec;
    RETURN v_rec;
  END IF;

  IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'ID ou revision absent' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_rec FROM public.garage_timer_sessions
    WHERE id=p_id AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session introuvable' USING ERRCODE='42501';
  END IF;
  IF v_rec.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Conflit de revision: recharger les sessions' USING ERRCODE='40001';
  END IF;
  IF p_work_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Le BT est immuable' USING ERRCODE='22023';
  END IF;
  IF v_rec.status='posted' THEN
    RAISE EXCEPTION 'Session deja transferee' USING ERRCODE='22023';
  END IF;

  IF p_action='start' THEN
    IF v_rec.status<>'paused' THEN
      RAISE EXCEPTION 'Mettre en pause avant redemarrage' USING ERRCODE='22023';
    END IF;
    v_rec.status := 'running';
    v_rec.last_heartbeat_at := v_now;
  ELSIF p_action='heartbeat' OR p_action='pause' THEN
    IF v_rec.status<>'running' THEN
      RAISE EXCEPTION 'Session inactive' USING ERRCODE='22023';
    END IF;
    v_delta := floor(extract(epoch FROM (v_now-v_rec.last_heartbeat_at))*1000)::bigint;
    IF v_delta < 0 THEN
      RAISE EXCEPTION 'Horloge serveur invalide' USING ERRCODE='22023';
    END IF;
    IF v_delta <= 20000 THEN
      v_rec.confirmed_ms := v_rec.confirmed_ms+v_delta;
    ELSE
      -- Fermeture brutale ou heartbeat trop tard : ne pas compter le trou.
      v_rec.status := 'paused';
      v_rec.last_heartbeat_at := NULL;
    END IF;
    IF v_rec.status='running' THEN
      IF p_action='pause' THEN
        v_rec.status := 'paused';
        v_rec.last_heartbeat_at := NULL;
      ELSE
        v_rec.last_heartbeat_at := v_now;
      END IF;
    END IF;
  ELSIF p_action='recover' THEN
    IF v_rec.status<>'running' THEN
      RAISE EXCEPTION 'Rien a recuperer' USING ERRCODE='22023';
    END IF;
    -- Une recuperation explicite NE compte pas le temps depuis le dernier heartbeat.
    v_rec.status := 'paused';
    v_rec.last_heartbeat_at := NULL;
  END IF;

  v_rec.updated_at := v_now;
  v_rec.revision := v_rec.revision+1;
  UPDATE public.garage_timer_sessions AS t
  SET status=v_rec.status, confirmed_ms=v_rec.confirmed_ms,
      last_heartbeat_at=v_rec.last_heartbeat_at, revision=v_rec.revision,
      updated_at=v_rec.updated_at
  WHERE t.id=v_rec.id AND t.user_id=v_uid AND t.revision=p_expected_revision
  RETURNING * INTO v_rec;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conflit pendant mise a jour' USING ERRCODE='40001';
  END IF;
  RETURN v_rec;
END;
$$;

REVOKE ALL ON FUNCTION public.s06_timer_transition(uuid,text,bigint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.s06_timer_transition(uuid,text,bigint,text)
  TO authenticated;

COMMIT;

-- BLOQUANTS AVANT DEPLOIEMENT TEST :
-- 1. Backup et test RLS 2 comptes reellement distincts, pas via service_role.
-- 2. Contrainte unique running + conflits rev/test double appareil.
-- 3. Une panne de reseau peut interrompre le cumul au dernier heartbeat confirme.
-- 4. VERIFIER l'appartenance du BT et l'etat paye/archive AVANT start et transfert.
--    Cette V1 cote serveur n'a pas encore de controle du BT dans garage_data JSON.
-- 5. Aucun transfert de main d'oeuvre (posted) n'est implemente dans cette migration.
-- 6. Ne pas utiliser le SQL Editor pour valider des droits utilisateur ordinaire.
