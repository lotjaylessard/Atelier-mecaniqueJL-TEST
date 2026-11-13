-- S08 TEST: no production writes. These are synthetic payments only.
DO $cases$
DECLARE
 b jsonb:='{"invoices":[{"number":"FA-2","status":"partial","total":50,"paidAmount":10,"payments":[{"date":"2026-11-12","amount":10,"method":"cash"}]}]}'::jsonb;
 add_valid jsonb:='{"invoices":[{"number":"FA-2","status":"partial","total":50,"paidAmount":20,"payments":[{"date":"2026-11-12","amount":10,"method":"cash"},{"date":"2026-11-13","amount":10,"method":"card"}]}]}'::jsonb;
 final_valid jsonb:='{"invoices":[{"number":"FA-2","status":"paid","total":50,"paidAmount":50,"payments":[{"date":"2026-11-12","amount":10,"method":"cash"},{"date":"2026-11-13","amount":40,"method":"card"}],"paidDate":"2026-11-13","paymentMethod":"card"}]}'::jsonb;
 tampered jsonb;
BEGIN
 IF NOT s08_private.preview_paid_invoice_integrity(b,b) THEN RAISE EXCEPTION 'No-op partial snapshot rejected'; END IF;
 IF NOT s08_private.preview_paid_invoice_integrity(b,add_valid) THEN RAISE EXCEPTION 'Valid extra partial payment rejected'; END IF;
 IF NOT s08_private.preview_paid_invoice_integrity(b,final_valid) THEN RAISE EXCEPTION 'Partial to fully paid rejected'; END IF;
 tampered:=jsonb_set(add_valid,'{invoices,0,total}','49'::jsonb);
 IF s08_private.preview_paid_invoice_integrity(b,tampered) THEN RAISE EXCEPTION 'Tampered invoice total accepted'; END IF;
 tampered:=jsonb_set(add_valid,'{invoices,0,payments,0,amount}','5'::jsonb);
 IF s08_private.preview_paid_invoice_integrity(b,tampered) THEN RAISE EXCEPTION 'Existing payment tamper accepted'; END IF;
 tampered:=jsonb_set(add_valid,'{invoices,0,paidAmount}','21'::jsonb);
 IF s08_private.preview_paid_invoice_integrity(b,tampered) THEN RAISE EXCEPTION 'Inconsistent payment sum accepted'; END IF;
 tampered:=jsonb_set(add_valid,'{invoices,0,paidAmount}','51'::jsonb);
 IF s08_private.preview_paid_invoice_integrity(b,tampered) THEN RAISE EXCEPTION 'Overpayment accepted'; END IF;
 tampered:=jsonb_set(add_valid,'{invoices,0,status}','"paid"'::jsonb);
 IF s08_private.preview_paid_invoice_integrity(b,tampered) THEN RAISE EXCEPTION 'Premature paid status accepted'; END IF;
 tampered:=jsonb_set(add_valid,'{invoices,0,status}','"draft"'::jsonb);
 IF s08_private.preview_paid_invoice_integrity(b,tampered) THEN RAISE EXCEPTION 'Reset to draft accepted'; END IF;
 IF s08_private.preview_paid_invoice_integrity(b,'{"invoices":[]}'::jsonb) THEN RAISE EXCEPTION 'Delete partial invoice accepted'; END IF;
 tampered:='{"invoices":[{"number":"FA-2","status":"partial","total":50,"paidAmount":20,"payments":[{"date":"2026-11-12","amount":10,"method":"cash"}]}]}'::jsonb;
 IF s08_private.preview_paid_invoice_integrity(b,tampered) THEN RAISE EXCEPTION 'Changed amount without appended payment accepted'; END IF;
 RAISE NOTICE 'S08 partial-payment preview scenarios passed';
END
$cases$;
SELECT count(*) AS real_active_garages,
       count(*) FILTER(WHERE s08_private.preview_paid_invoice_integrity(data,data)) AS existing_snapshot_allowed
FROM public.garage_data WHERE garage_id IS NOT NULL;