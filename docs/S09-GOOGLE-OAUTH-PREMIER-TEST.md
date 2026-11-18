# S09 / Phase 3 — First real Google Calendar account TEST

Status: server-side OAuth endpoint deployed in TEST. It will intentionally return google_available=false and reject connection attempts until administrator configures Google Cloud OAuth and three secrets. Production is untouched.

## Google Cloud (one-time setup by owner)
1. Open https://console.cloud.google.com/ and create or select a dedicated TEST project for Garage-Atelier JL.
2. Enable **Google Calendar API** in APIs & Services > Library.
3. In Google Auth Platform configure the OAuth branding and audience. Select External for a personal Gmail account; keep Testing and add the exact Google account email used for the first test to **Test users**.
4. Create an OAuth client of type **Web application**. Give it a clear name such as Garage JL TEST — calendrier.
5. Add this **exact authorized redirect URI**:

   https://nraijzsodgojkpyigefu.supabase.co/functions/v1/garage-calendar-oauth

6. Keep the Client ID and Client Secret private. Do **not** paste the secret in ChatGPT, GitHub, Codespaces source code or a screenshot.
7. In Supabase **Atelier-mecaniqueJL-TEST** > Edge Functions > Secrets (https://supabase.com/dashboard/project/nraijzsodgojkpyigefu/functions/secrets), add:
   - GOOGLE_CALENDAR_CLIENT_ID — value from Google Cloud
   - GOOGLE_CALENDAR_CLIENT_SECRET — value from Google Cloud
   - GOOGLE_CALENDAR_ENCRYPTION_KEY_HEX — securely generated random 32-byte key encoded as 64 hexadecimal characters

For generating the encryption key safely, use a trusted local terminal:

   python -c "import secrets; print(secrets.token_hex(32))"

Paste the random key directly into the Supabase secret field, not a chat or a repository. Supabase Edge Functions receive updated secrets without redeployment.

## First account test
1. In Codespaces on feature/notes-bt-historique, run `git pull` then refresh Chrome.
2. Open Horaire > Mes calendriers. After secrets are set, the Google connection button should become active.
3. Click Connecter Google Calendar. On Google's permission page, verify the requested permission is read-only. Sign in to the intended TEST calendar account and approve.
4. The Google callback confirms success in a separate function response page; return to the Garage TEST app and reopen Mes calendriers to see its status.
5. The first test connects **one primary Google Calendar** only. This does not yet import events into the month view. Sync and multiple-calendar selection are later steps.

## Security / operational notes
- The OAuth callback is public so Google can redirect to it; the server requires short-lived, single-use state linked to an authenticated garage member and PKCE.
- Only the server exchanges authorization codes and stores AES-GCM encrypted refresh tokens.
- In Google Testing mode, refresh-token validity can be limited. Reauthorization may be required.
- No direct employee access to refresh tokens, PKCE verifiers or OAuth client secrets.
- Never use Garage production credentials or Google production OAuth clients for the TEST environment.
- Google authorizations may be revoked in the Google account permissions page if needed.

## How to verify readiness
- The endpoint `https://nraijzsodgojkpyigefu.supabase.co/functions/v1/garage-calendar-oauth` publishes only a small non-secret readiness response.
- Before configured: `{ "google_available": false, "phase": "test", "read_only": true }`.
- After configured: `google_available` should be true; a real member still needs to explicitly authorize their account.

## Official documents
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/auth
- https://supabase.com/docs/guides/functions/secrets
