-- S08 TEST ONLY — standalone preview validator, NOT attached to any trigger.
-- No existing invoice data is written or changed.
CREATE FUNCTION s08_private.preview_paid_invoice_integrity(
  p_before jsonb, p_after jsonb
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path=''
AS $guard$
DECLARE
  inv jsonb;
  replacement jsonb;
  invoice_number text;
  match_count integer;
BEGIN
  IF pg_catalog.jsonb_typeof(p_before->'invoices')<>'array'
     OR pg_catalog.jsonb_typeof(p_after->'invoices')<>'array' THEN
    RETURN false;
  END IF;

  FOR inv IN SELECT value FROM pg_catalog.jsonb_array_elements(p_before->'invoices')
  LOOP
    IF inv->>'status'='paid' OR inv->>'archived'='true' THEN
      invoice_number:=inv->>'number';
      IF invoice_number IS NULL OR pg_catalog.btrim(invoice_number)='' THEN
        RETURN false;
      END IF;
      SELECT count(*), pg_catalog.max(value)
      INTO match_count,replacement
      FROM pg_catalog.jsonb_array_elements(p_after->'invoices') value
      WHERE value->>'number'=invoice_number;
      IF match_count<>1 THEN RETURN false; END IF;
      IF inv=replacement THEN CONTINUE; END IF;

      -- A paid invoice may be archived once without changing any other field.
      IF inv->>'status'='paid'
         AND inv->>'archived' IS DISTINCT FROM 'true'
         AND replacement->>'archived'='true'
         AND (inv - 'archived' - 'archivedDate')
           =(replacement - 'archived' - 'archivedDate')
      THEN
        CONTINUE;
      END IF;

      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$guard$;

REVOKE ALL ON FUNCTION s08_private.preview_paid_invoice_integrity(jsonb,jsonb)
FROM PUBLIC,anon,authenticated;
