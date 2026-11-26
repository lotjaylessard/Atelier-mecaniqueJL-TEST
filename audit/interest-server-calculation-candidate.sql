-- Candidate only; do not activate payment UI until integration tests pass.
CREATE OR REPLACE FUNCTION public.jl_interest_due_cents(inv jsonb, as_of date)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $$
DECLARE
 t jsonb:=inv->'interestTerms'; principal numeric; rate numeric; grace numeric;
 issued date; accepted date; cursor_day date; end_day date; p jsonb; pd date;
 amount numeric; weighted numeric:=0; receipts numeric:=0; accrued numeric; paid numeric:=0;
BEGIN
 IF t->'enabled' IS DISTINCT FROM 'true'::jsonb OR t->'accepted' IS DISTINCT FROM 'true'::jsonb OR t->'waived'='true'::jsonb THEN
  IF jsonb_array_length(COALESCE(inv->'interestPayments','[]'::jsonb))>0 THEN RAISE EXCEPTION 'Interest receipts without valid terms'; END IF;
  RETURN 0;
 END IF;
 principal:=(inv->>'total')::numeric*100; rate:=(t->>'annualRate')::numeric; grace:=(t->>'graceDays')::numeric;
 issued:=(inv->>'date')::date; accepted:=(t->>'acceptedDate')::date;
 end_day:=CASE WHEN inv->>'status'='paid' THEN (inv->>'paidDate')::date ELSE as_of END;
 IF principal IS NULL OR principal<0 OR principal<>trunc(principal) OR rate IS NULL OR rate<=0 OR rate>100 OR grace IS NULL OR grace<>trunc(grace) OR grace<0 OR grace>365 OR issued IS NULL OR accepted IS NULL OR accepted>issued OR end_day IS NULL OR end_day<issued OR end_day>as_of THEN RAISE EXCEPTION 'Invalid interest terms'; END IF;
 cursor_day:=issued+grace::int;
 FOR p IN SELECT value FROM jsonb_array_elements(COALESCE(inv->'payments','[]'::jsonb)) ORDER BY (value->>'date')::date LOOP
  pd:=(p->>'date')::date; amount:=(p->>'amount')::numeric*100;
  IF pd IS NULL OR pd<issued OR pd>end_day OR amount IS NULL OR amount<=0 OR amount<>trunc(amount) OR amount>principal THEN RAISE EXCEPTION 'Invalid principal receipt'; END IF;
  weighted:=weighted+principal*greatest(0,pd-cursor_day); cursor_day:=greatest(cursor_day,pd); principal:=principal-amount; paid:=paid+amount;
 END LOOP;
 IF paid IS DISTINCT FROM COALESCE((inv->>'paidAmount')::numeric,0)*100 THEN RAISE EXCEPTION 'Principal history mismatch'; END IF;
 accrued:=round((weighted+principal*greatest(0,end_day-cursor_day))*rate/36500);
 FOR p IN SELECT value FROM jsonb_array_elements(COALESCE(inv->'interestPayments','[]'::jsonb)) LOOP
  pd:=(p->>'date')::date; amount:=(p->>'amount')::numeric*100;
  IF pd IS NULL OR pd<issued OR pd>end_day OR amount IS NULL OR amount<=0 OR amount<>trunc(amount) THEN RAISE EXCEPTION 'Invalid interest receipt'; END IF;
  receipts:=receipts+amount;
 END LOOP;
 IF receipts>accrued OR (receipts>0 AND principal<>0) THEN RAISE EXCEPTION 'Interest receipt mismatch'; END IF;
 RETURN accrued-receipts;
END $$;
REVOKE ALL ON FUNCTION public.jl_interest_due_cents(jsonb,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jl_interest_due_cents(jsonb,date) TO authenticated;
