-- S08 TEST ONLY: fully isolated trigger integration in a temporary table.
-- Does not add triggers or alter public.garage_data. ROLLBACK clears all test DDL.
BEGIN;
CREATE TEMP TABLE s08_invoice_trigger_sandbox (
 id integer PRIMARY KEY,
 data jsonb NOT NULL
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.s08_invoice_trigger_test()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $body$
BEGIN
 IF NOT s08_private.preview_paid_invoice_integrity(OLD.data,NEW.data) THEN
  RAISE EXCEPTION 'AUDIT_INVOICE_PROTECTED';
 END IF;
 RETURN NEW;
END
$body$;
CREATE TRIGGER s08_invoice_trigger_test
BEFORE UPDATE OF data ON s08_invoice_trigger_sandbox
FOR EACH ROW EXECUTE FUNCTION pg_temp.s08_invoice_trigger_test();

INSERT INTO s08_invoice_trigger_sandbox VALUES
(1,'{"invoices":[{"number":"FA-A","status":"paid","total":50,"paidAmount":50,"payments":[{"amount":50}]}],"notes":[]}'::jsonb),
(2,'{"invoices":[{"number":"FA-B","status":"partial","total":50,"paidAmount":10,"payments":[{"amount":10}]}],"notes":[]}'::jsonb);

DO $audit$
DECLARE
 rejected boolean;
BEGIN
 -- Real table UPDATE succeeds for unrelated garage notes.
 UPDATE s08_invoice_trigger_sandbox SET data=jsonb_set(data,'{notes}','[{"id":"n1"}]'::jsonb)
 WHERE id=1;
 -- Real table UPDATE succeeds to archive a paid invoice.
 UPDATE s08_invoice_trigger_sandbox
 SET data=jsonb_set(jsonb_set(data,'{invoices,0,archived}','true'::jsonb,true),
                    '{invoices,0,archivedDate}','"2026-11-13"'::jsonb,true)
 WHERE id=1;

 rejected:=false;
 BEGIN
   UPDATE s08_invoice_trigger_sandbox
   SET data=jsonb_set(data,'{invoices,0,total}','70'::jsonb)
   WHERE id=1;
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'AUDIT_INVOICE_PROTECTED' THEN RAISE; END IF;
   rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Paid invoice mutation passed the trigger'; END IF;

 -- A partial payment is allowed, but an existing payment cannot be changed.
 UPDATE s08_invoice_trigger_sandbox SET data=jsonb_set(
     jsonb_set(data,'{invoices,0,paidAmount}','20'::jsonb),
     '{invoices,0,payments}',
     '[{"amount":10},{"amount":10}]'::jsonb) WHERE id=2;
 rejected:=false;
 BEGIN
   UPDATE s08_invoice_trigger_sandbox
   SET data=jsonb_set(data,'{invoices,0,payments,0,amount}','5'::jsonb)
   WHERE id=2;
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'AUDIT_INVOICE_PROTECTED' THEN RAISE; END IF;
   rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Historical partial payment mutation passed the trigger'; END IF;
 IF (SELECT data #>> '{invoices,0,paidAmount}' FROM s08_invoice_trigger_sandbox WHERE id=2)<>'20'
   OR (SELECT data #>> '{invoices,0,total}' FROM s08_invoice_trigger_sandbox WHERE id=1)<>'50'
 THEN RAISE EXCEPTION 'Failed UPDATE left an inconsistent snapshot'; END IF;
 RAISE NOTICE 'S08 actual PostgreSQL trigger sandbox passed: allowed notes, archive, appended partial; rejected tampering';
END
$audit$;
ROLLBACK;
