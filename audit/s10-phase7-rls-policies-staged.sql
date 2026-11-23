-- S10 Phase 7: TEST RLS policies, additive to local schema.
-- STAGING ONLY. Do not apply to PROD before multi-role tests.
BEGIN;

DROP POLICY IF EXISTS "garage_calendar_notes_delete_own" ON public.garage_calendar_notes;
CREATE POLICY "garage_calendar_notes_delete_own" ON public.garage_calendar_notes AS PERMISSIVE FOR DELETE TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_calendar_notes.garage_id))))));

DROP POLICY IF EXISTS "garage_calendar_notes_insert_own" ON public.garage_calendar_notes;
CREATE POLICY "garage_calendar_notes_insert_own" ON public.garage_calendar_notes AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_calendar_notes.garage_id))))));

DROP POLICY IF EXISTS "garage_calendar_notes_read_own" ON public.garage_calendar_notes;
CREATE POLICY "garage_calendar_notes_read_own" ON public.garage_calendar_notes AS PERMISSIVE FOR SELECT TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_calendar_notes.garage_id))))));

DROP POLICY IF EXISTS "garage_calendar_notes_update_own" ON public.garage_calendar_notes;
CREATE POLICY "garage_calendar_notes_update_own" ON public.garage_calendar_notes AS PERMISSIVE FOR UPDATE TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_calendar_notes.garage_id))))))
WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_calendar_notes.garage_id))))));

DROP POLICY IF EXISTS "calendar_connections_select_owner" ON public.garage_external_calendar_connections;
CREATE POLICY "calendar_connections_select_owner" ON public.garage_external_calendar_connections AS PERMISSIVE FOR SELECT TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_external_calendar_connections.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "calendar_events_select_owner" ON public.garage_external_calendar_events;
CREATE POLICY "calendar_events_select_owner" ON public.garage_external_calendar_events AS PERMISSIVE FOR SELECT TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_external_calendar_connections c
  WHERE ((c.id = garage_external_calendar_events.connection_id) AND (c.user_id = garage_external_calendar_events.user_id) AND (c.garage_id = garage_external_calendar_events.garage_id)))) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_external_calendar_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Members can read own membership" ON public.garage_members;
CREATE POLICY "Members can read own membership" ON public.garage_members AS PERMISSIVE FOR SELECT TO authenticated
USING ((user_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "quotes_delete_own" ON public.garage_quotes;
CREATE POLICY "quotes_delete_own" ON public.garage_quotes AS PERMISSIVE FOR DELETE TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_quotes.garage_id))))));

DROP POLICY IF EXISTS "quotes_insert_own" ON public.garage_quotes;
CREATE POLICY "quotes_insert_own" ON public.garage_quotes AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_quotes.garage_id))))));

DROP POLICY IF EXISTS "quotes_read_same_garage" ON public.garage_quotes;
CREATE POLICY "quotes_read_same_garage" ON public.garage_quotes AS PERMISSIVE FOR SELECT TO authenticated
USING (((garage_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_quotes.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.role = ANY (ARRAY['owner'::text, 'employee'::text])))))));

DROP POLICY IF EXISTS "quotes_update_same_garage" ON public.garage_quotes;
CREATE POLICY "quotes_update_same_garage" ON public.garage_quotes AS PERMISSIVE FOR UPDATE TO authenticated
USING (((garage_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_quotes.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.role = ANY (ARRAY['owner'::text, 'employee'::text])))))))
WITH CHECK (((garage_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_quotes.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.role = ANY (ARRAY['owner'::text, 'employee'::text])))))));

DROP POLICY IF EXISTS "schedule_events_delete" ON public.garage_schedule_events;
CREATE POLICY "schedule_events_delete" ON public.garage_schedule_events AS PERMISSIVE FOR DELETE TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_schedule_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "schedule_events_insert" ON public.garage_schedule_events;
CREATE POLICY "schedule_events_insert" ON public.garage_schedule_events AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_schedule_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "schedule_events_read" ON public.garage_schedule_events;
CREATE POLICY "schedule_events_read" ON public.garage_schedule_events AS PERMISSIVE FOR SELECT TO authenticated
USING ((((visibility = 'private'::text) AND (user_id = ( SELECT auth.uid() AS uid))) OR ((visibility = 'workshop'::text) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_schedule_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS "schedule_events_update" ON public.garage_schedule_events;
CREATE POLICY "schedule_events_update" ON public.garage_schedule_events AS PERMISSIVE FOR UPDATE TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_schedule_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))))
WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.garage_id = garage_schedule_events.garage_id) AND (gm.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "s06_timer_select_own" ON public.garage_timer_sessions;
CREATE POLICY "s06_timer_select_own" ON public.garage_timer_sessions AS PERMISSIVE FOR SELECT TO authenticated
USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM garage_members gm
  WHERE ((gm.user_id = ( SELECT auth.uid() AS uid)) AND (gm.garage_id = garage_timer_sessions.garage_id))))));

DROP POLICY IF EXISTS "Members can read their garages" ON public.garages;
CREATE POLICY "Members can read their garages" ON public.garages AS PERMISSIVE FOR SELECT TO authenticated
USING ((EXISTS ( SELECT 1
   FROM garage_members
  WHERE ((garage_members.garage_id = garages.id) AND (garage_members.user_id = ( SELECT auth.uid() AS uid))))));
COMMIT;
