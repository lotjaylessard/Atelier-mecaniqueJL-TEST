# S09 Phase 3 — Personal Google / Microsoft calendar integration

Scope: TEST only. Preparatory work, no real OAuth connection or external calendar access.

## Approved requirements
- Each owner connects their own provider: Google Calendar or Microsoft Outlook/Hotmail.
- Strictly private: another employee never sees personal event details or even free/busy slots.
- Workshop closures are separate and shared with authorized colleagues.
- Do not merge personal events with workshop events, quotes, WOs or customer notes.
- External calendars read-only by default. Do not write to Google or Microsoft without new approval.
- Friend's duplicate Hotmail-to-Gmail copies must not blindly double-import. Cross-provider de-duplication is a separate design task.

## Security and data boundaries
1. OAuth authorization per individual user. Validate callback state, use PKCE, and handle token revocation.
2. Exchange and refresh credentials only on a secure server such as a Supabase Edge Function.
3. Never store provider refresh tokens or client secrets in GitHub, browser JavaScript, localStorage or user-visible tables.
4. Separate external calendar connection metadata and event cache by garage ID, user ID, provider, calendar ID.
5. Enforce Supabase RLS using auth.uid() = user_id AND garage membership; check INSERT, UPDATE, DELETE as well as SELECT.
6. Do not persist imported personal events to garage_schedule_events or garage_calendar_notes.
7. Preserve deletion markers, recurring instances, timezones, DST, pagination and revoked/expired connections.
8. Never use a browser filter as the only privacy boundary. Do not log private calendar contents.

## Sync design
- Google: initial events list, pagination, nextSyncToken incremental sync, HTTP 410 recovery.
- Microsoft: calendarView delta initial paging and @odata.nextLink / @odata.deltaLink.
- Explicit status for syncing, last successful sync, reconnect required and disconnected.
- Server-controlled sync cadence and error handling; failed providers must not affect garage data.

## Code in this branch
- integrations/calendar-adapters.cjs: provider-specific pure normalization with owner_only, read-only outputs; zero network calls.
- tests/s09-calendar-providers.test.cjs: date, deletion and isolation regression cases.
- No OAuth integrations, no new database tables, and no calendar account connections have been activated.

## Gate before real integration
- Obtain provider app registrations and redirect URLs for TEST only.
- Request minimal delegated scopes (Google Calendar read-only, Microsoft Calendars.Read).
- Consent from each user before accessing their calendar.
- Verify RLS with separate test accounts, revocation, reconnection, recurring events and DST.
- Complete full Garage regression suite before production consideration.

## Official reference docs
- https://developers.google.com/workspace/calendar/api/guides/sync
- https://developers.google.com/workspace/calendar/api/v3/reference/events/list
- https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/permissions-reference
- https://supabase.com/docs/guides/functions/schedule-functions
