-- S06 TEST - migration de calcul exact a la milliseconde.
-- Remplace UNIQUEMENT public.s06_timer_post_labor sans modifier les donnees existantes.
-- 42 000 ms a 90 $/h -> 1,05 $; quantite hours conservee avec 12 decimales.
-- Ne pas appliquer sur production sans validation separee.
CREATE OR REPLACE FUNCTION public.s06_timer_post_labor(
  p_session_id uuid,
  p_expected_revision bigint,
  p_expected_garage_version bigint,
  p_description text,
  p_hourly_rate numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $s06$
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
    'description','Main-d''oeuvre (minuterie S06)',
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
$s06$;

REVOKE ALL ON FUNCTION public.s06_timer_post_labor(uuid,bigint,bigint,text,numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.s06_timer_post_labor(uuid,bigint,bigint,text,numeric)
  TO authenticated;
