-- S08 TEST: synthetic paid invoice validation — no real garage rows.
-- The preview helper is NOT wired into the actual update trigger.
DO $cases$
DECLARE
  paid jsonb := '{"invoices":[{"number":"FA-1","status":"paid","total":50,"paidAmount":50,"payments":[{"amount":50}]}]}'::jsonb;
  archived jsonb := '{"invoices":[{"number":"FA-1","status":"paid","total":50,"paidAmount":50,"payments":[{"amount":50}],"archived":true,"archivedDate":"2026-11-13"}]}'::jsonb;
  partial jsonb := '{"invoices":[{"number":"FA-2","status":"partial","total":50,"paidAmount":10,"payments":[{"amount":10}]}]}'::jsonb;
  partial_more jsonb := '{"invoices":[{"number":"FA-2","status":"partial","total":50,"paidAmount":20,"payments":[{"amount":10},{"amount":10}]}]}'::jsonb;
  partial_paid jsonb := '{"invoices":[{"number":"FA-2","status":"paid","total":50,"paidAmount":50,"payments":[{"amount":10},{"amount":40}]}]}'::jsonb;
BEGIN
  IF NOT s08_private.preview_paid_invoice_integrity(paid,paid) THEN
    RAISE EXCEPTION 'Identical paid invoice unexpectedly rejected';
  END IF;
  IF s08_private.preview_paid_invoice_integrity(paid,
    '{"invoices":[{"number":"FA-1","status":"paid","total":51,"paidAmount":50,"payments":[{"amount":50}]}]}'::jsonb) THEN
    RAISE EXCEPTION 'Paid invoice total change accepted';
  END IF;
  IF s08_private.preview_paid_invoice_integrity(paid,'{"invoices":[]}'::jsonb) THEN
    RAISE EXCEPTION 'Paid invoice deletion accepted';
  END IF;
  IF s08_private.preview_paid_invoice_integrity(paid,
    '{"invoices":[{"number":"FA-1","status":"paid","total":50,"paidAmount":49,"payments":[{"amount":49}]}]}'::jsonb) THEN
    RAISE EXCEPTION 'Paid invoice payment history change accepted';
  END IF;
  IF NOT s08_private.preview_paid_invoice_integrity(paid,archived) THEN
    RAISE EXCEPTION 'Legitimate archive rejected';
  END IF;
  IF s08_private.preview_paid_invoice_integrity(archived,paid) THEN
    RAISE EXCEPTION 'Archived invoice unarchive accepted';
  END IF;
  IF s08_private.preview_paid_invoice_integrity(archived,
    '{"invoices":[{"number":"FA-1","status":"paid","total":55,"paidAmount":50,"payments":[{"amount":50}],"archived":true,"archivedDate":"2026-11-13"}]}'::jsonb) THEN
    RAISE EXCEPTION 'Archived paid amount modification accepted';
  END IF;
  IF NOT s08_private.preview_paid_invoice_integrity(partial,partial_more) THEN
    RAISE EXCEPTION 'Legitimate partial payment rejected';
  END IF;
  IF NOT s08_private.preview_paid_invoice_integrity(partial,partial_paid) THEN
    RAISE EXCEPTION 'Legitimate partial-to-paid transition rejected';
  END IF;
  IF s08_private.preview_paid_invoice_integrity(paid,
    '{"invoices":[{"number":"FA-1","status":"paid","total":50,"paidAmount":50,"payments":[{"amount":50}]},{"number":"FA-1","status":"paid","total":50,"paidAmount":50,"payments":[{"amount":50}]}]}'::jsonb) THEN
    RAISE EXCEPTION 'Duplicate paid invoice number accepted';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated',
      's08_private.preview_paid_invoice_integrity(jsonb,jsonb)','EXECUTE')
     OR pg_catalog.has_function_privilege('anon',
      's08_private.preview_paid_invoice_integrity(jsonb,jsonb)','EXECUTE')
  THEN
    RAISE EXCEPTION 'Preview helper exposed to API roles';
  END IF;
  RAISE NOTICE 'S08: paid invoice preview scenarios and permissions passed';
END
$cases$;