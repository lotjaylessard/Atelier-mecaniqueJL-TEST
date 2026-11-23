-- CANDIDATE ONLY: do not deploy to TEST or PROD without authenticated testing.
-- This creates a NEW owner-only RPC; does not replace the existing TEST RPC.
-- Depends on TEST-compatible RLS and the real 12-table schema.
BEGIN;
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
COMMIT;
