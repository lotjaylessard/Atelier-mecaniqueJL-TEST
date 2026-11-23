-- S10 Phase 9: triggers from Supabase TEST, after Phase 5 and 6 functions.
-- STAGING ONLY; do not execute in PROD without approval.
BEGIN;
DROP TRIGGER IF EXISTS protect_garage_data_ids_trigger ON public.garage_data;
CREATE TRIGGER protect_garage_data_ids_trigger BEFORE UPDATE ON public.garage_data FOR EACH ROW EXECUTE FUNCTION public.protect_garage_data_ids();
DROP TRIGGER IF EXISTS s08_assign_quote_tracking_number_before_insert ON public.garage_quotes;
CREATE TRIGGER s08_assign_quote_tracking_number_before_insert BEFORE INSERT ON public.garage_quotes FOR EACH ROW EXECUTE FUNCTION public.s08_assign_quote_tracking_number();
DROP TRIGGER IF EXISTS s09_quote_identity_immutable ON public.garage_quotes;
CREATE TRIGGER s09_quote_identity_immutable BEFORE UPDATE ON public.garage_quotes FOR EACH ROW EXECUTE FUNCTION public.s09_protect_quote_identity();
COMMIT;
