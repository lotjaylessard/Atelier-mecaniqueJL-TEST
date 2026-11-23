-- S10 Phase 6: functions copied from TEST, excluding unsafe TEST-only invoice RPC
-- and obsolete/ungranted invoice variants. Supabase environment required.
-- STAGING ONLY. No production deployment authorized.
BEGIN;

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
COMMIT;
