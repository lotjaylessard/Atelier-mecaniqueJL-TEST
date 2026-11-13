-- S08 TEST ONLY: invoice guard preview v2.
-- Not attached to any trigger; API roles cannot execute it.
-- Protect paid/archived invoices, and the previous payment history for partial invoices.
CREATE OR REPLACE FUNCTION s08_private.preview_paid_invoice_integrity(
  p_before jsonb,p_after jsonb
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path=''
AS $guard$
DECLARE
  old_inv jsonb;
  new_inv jsonb;
  number text;
  matches integer;
  old_payments jsonb;
  new_payments jsonb;
  old_len integer;
  new_len integer;
  old_paid numeric;
  new_paid numeric;
  total numeric;
  sum_paid numeric;
  payment jsonb;
  i integer;
BEGIN
  IF pg_catalog.jsonb_typeof(p_before->'invoices')<>'array'
    OR pg_catalog.jsonb_typeof(p_after->'invoices')<>'array'
  THEN RETURN false; END IF;

  FOR old_inv IN SELECT value FROM pg_catalog.jsonb_array_elements(p_before->'invoices')
  LOOP
    IF old_inv->>'status'='paid'
      OR old_inv->>'archived'='true'
      OR old_inv->>'status'='partial'
      OR COALESCE((old_inv->>'paidAmount')::numeric,0)>0
    THEN
      number:=old_inv->>'number';
      IF number IS NULL OR pg_catalog.btrim(number)='' THEN RETURN false; END IF;
      SELECT count(*),(pg_catalog.array_agg(value))[1] INTO matches,new_inv
      FROM pg_catalog.jsonb_array_elements(p_after->'invoices') value
      WHERE value->>'number'=number;
      IF matches<>1 THEN RETURN false; END IF;
      IF old_inv=new_inv THEN CONTINUE; END IF;

      IF old_inv->>'status'='paid' OR old_inv->>'archived'='true' THEN
        IF old_inv->>'status'='paid'
          AND old_inv->>'archived' IS DISTINCT FROM 'true'
          AND new_inv->>'archived'='true'
          AND (old_inv-'archived'-'archivedDate')
             =(new_inv-'archived'-'archivedDate')
        THEN CONTINUE; END IF;
        RETURN false;
      END IF;

      -- For partial payments preserve ALL previous invoice fields, except
      -- the fields updated by the existing markInvoicePartial() workflow.
      IF (old_inv-'payments'-'paidAmount'-'status'-'paidDate'-'paymentMethod')
         <>(new_inv-'payments'-'paidAmount'-'status'-'paidDate'-'paymentMethod')
      THEN RETURN false; END IF;
      IF new_inv->>'status' IS NULL OR new_inv->>'status' NOT IN ('partial','paid') THEN RETURN false; END IF;
      IF new_inv->>'status'='partial' AND (
        old_inv->>'paidDate' IS DISTINCT FROM new_inv->>'paidDate' OR
        old_inv->>'paymentMethod' IS DISTINCT FROM new_inv->>'paymentMethod'
      ) THEN RETURN false; END IF;
      IF pg_catalog.jsonb_typeof(old_inv->'payments')<>'array'
        OR pg_catalog.jsonb_typeof(new_inv->'payments')<>'array'
      THEN RETURN false; END IF;
      old_payments:=old_inv->'payments';
      new_payments:=new_inv->'payments';
      old_len:=pg_catalog.jsonb_array_length(old_payments);
      new_len:=pg_catalog.jsonb_array_length(new_payments);
      IF new_len<=old_len THEN RETURN false; END IF;
      FOR i IN 0..old_len-1 LOOP
        IF old_payments->i<>new_payments->i THEN RETURN false; END IF;
      END LOOP;
      IF COALESCE(new_inv->>'total','') !~ '^[0-9]+(\.[0-9]+)?$'
       OR COALESCE(old_inv->>'paidAmount','') !~ '^[0-9]+(\.[0-9]+)?$'
       OR COALESCE(new_inv->>'paidAmount','') !~ '^[0-9]+(\.[0-9]+)?$'
      THEN RETURN false; END IF;
      total:=(new_inv->>'total')::numeric;
      old_paid:=(old_inv->>'paidAmount')::numeric;
      new_paid:=(new_inv->>'paidAmount')::numeric;
      IF old_paid<0 OR new_paid<=old_paid OR new_paid>total+0.009 THEN RETURN false; END IF;
      sum_paid:=0;
      FOR payment IN SELECT value FROM pg_catalog.jsonb_array_elements(new_payments)
      LOOP
        IF COALESCE(payment->>'amount','') !~ '^[0-9]+(\.[0-9]+)?$'
        THEN RETURN false; END IF;
        sum_paid:=sum_paid+(payment->>'amount')::numeric;
      END LOOP;
      IF pg_catalog.abs(sum_paid-new_paid)>0.009 THEN RETURN false; END IF;
      IF new_inv->>'status'='paid' AND pg_catalog.abs(total-new_paid)>0.009
      THEN RETURN false; END IF;
      IF new_inv->>'status'='partial' AND new_paid>=total-0.009
      THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END
$guard$;

REVOKE ALL ON FUNCTION s08_private.preview_paid_invoice_integrity(jsonb,jsonb)
FROM PUBLIC,anon,authenticated;
