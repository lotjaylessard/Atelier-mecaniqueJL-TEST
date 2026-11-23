-- S10 Phase 5: exact function definitions from Supabase TEST, without TEST business data.
-- STAGING ONLY: requires full Supabase auth roles and all S10 tables.
-- No RLS policy changes. Do not run in PROD until integration approval.
BEGIN;

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
COMMIT;
