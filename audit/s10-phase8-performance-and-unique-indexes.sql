-- S10 Phase 8: additive indexes from Supabase TEST, no data copied.
-- STAGING ONLY; test locally before PROD authorization.
BEGIN;

CREATE INDEX IF NOT EXISTS garage_calendar_notes_owner_day_idx ON public.garage_calendar_notes USING btree (garage_id, user_id, note_date, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS garage_data_garage_id_unique ON public.garage_data USING btree (garage_id);

CREATE INDEX IF NOT EXISTS gce_owner_idx ON public.garage_external_calendar_connections USING btree (garage_id, user_id);

CREATE INDEX IF NOT EXISTS gee_owner_range_idx ON public.garage_external_calendar_events USING btree (garage_id, user_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS garage_oauth_states_expire ON public.garage_external_oauth_states USING btree (expires_at);

CREATE INDEX IF NOT EXISTS garage_members_user_id_idx ON public.garage_members USING btree (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS garage_quotes_unique_number ON public.garage_quotes USING btree (garage_id, quote_number);

CREATE INDEX IF NOT EXISTS schedule_events_scope_idx ON public.garage_schedule_events USING btree (garage_id, start_date, end_date);

CREATE UNIQUE INDEX IF NOT EXISTS s06_timer_once_posted ON public.garage_timer_sessions USING btree (user_id, posted_labor_id) WHERE (posted_labor_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS s06_timer_one_running_per_user ON public.garage_timer_sessions USING btree (user_id) WHERE (status = 'running'::text);

CREATE INDEX IF NOT EXISTS s06_timer_user_work_order ON public.garage_timer_sessions USING btree (user_id, garage_id, work_order_id);
COMMIT;
