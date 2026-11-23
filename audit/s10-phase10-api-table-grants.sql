-- S10 Phase 10: API privileges for newly created tenant tables.
-- RLS remains mandatory: GRANT never bypasses row policies.
-- Sensitive token/OAuth/feed-secret tables deliberately have NO client grants.
-- STAGING ONLY: not approved for production execution.
BEGIN;
REVOKE ALL ON TABLE public.garages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garages TO authenticated;
REVOKE ALL ON TABLE public.garage_members FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_members TO authenticated;
REVOKE ALL ON TABLE public.garage_quotes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_quotes TO authenticated;
REVOKE ALL ON TABLE public.garage_timer_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_timer_sessions TO authenticated;
REVOKE ALL ON TABLE public.garage_calendar_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_calendar_notes TO authenticated;
REVOKE ALL ON TABLE public.garage_schedule_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_schedule_events TO authenticated;
REVOKE ALL ON TABLE public.garage_external_calendar_connections FROM anon;
GRANT SELECT ON TABLE public.garage_external_calendar_connections TO authenticated;
REVOKE ALL ON TABLE public.garage_external_calendar_events FROM anon;
GRANT SELECT ON TABLE public.garage_external_calendar_events TO authenticated;
REVOKE ALL ON TABLE public.garage_external_calendar_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.garage_external_oauth_states FROM anon, authenticated;
REVOKE ALL ON TABLE public.garage_familywall_feed_secrets FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.garage_quotes_number_seq FROM anon;
GRANT USAGE ON SEQUENCE public.garage_quotes_number_seq TO authenticated;
COMMIT;
