'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const oauth=fs.readFileSync(path.join(__dirname,'..','supabase','functions','garage-calendar-oauth','index.ts'),'utf8');
test('Google TEST button is fail-closed until server readiness',()=>{
  assert.match(html,/id="jlScheduleConnectGoogle"[^>]*disabled/);
  assert.match(html,/googleButton.disabled=connectedGoogle\?false:!config.google_available/);
  assert.match(html,/const JL_CALENDAR_GOOGLE_TEST_ENDPOINT="https:\/\/nraijzsodgojkpyigefu\.supabase\.co\/functions\/v1\/garage-calendar-oauth"/);
});
test('browser sends the signed-in Supabase bearer, not OAuth credentials',()=>{
  assert.match(html,/const \{data:session,error:sessionError\}=await db.auth.getSession\(\)/);
  assert.match(html,/Authorization":"Bearer "\+session.session.access_token/);
  assert.match(html,/garage_id:ACTIVE_GARAGE_ID/);
  assert.doesNotMatch(html,/GOOGLE_CALENDAR_CLIENT_SECRET|GOOGLE_CALENDAR_ENCRYPTION_KEY_HEX|refresh_token_ciphertext/);
});
test('server requires user identity and membership before creating OAuth state',()=>{
  assert.match(oauth,/async function getCaller\(req:Request\)/);
  assert.match(oauth,/fetch\(dbUrl\+"\/auth\/v1\/user"/);
  assert.match(oauth,/const membership=await rest\("garage_members","GET"/);
  assert.match(oauth,/if\(!Array\.isArray\(membership\)\|\|membership\.length!==1\)/);
});
test('provider redirect verifies short-lived single-use state and PKCE',()=>{
  assert.match(oauth,/code_challenge_method:"S256"/);
  assert.match(oauth,/expires_at:new Date\(Date\.now\(\)\+10\*60\*1000\)/);
  assert.match(oauth,/const stateHash=hex\(await sha\(state\)\)/);
  assert.match(oauth,/await rest\("garage_external_oauth_states","DELETE"/);
  assert.match(oauth,/code_verifier:record\.pkce_verifier/);
});
test('Google permission is read-only and refresh token is server encrypted',()=>{
  assert.match(oauth,/https:\/\/www\.googleapis\.com\/auth\/calendar\.readonly/);
  assert.match(oauth,/AES-GCM/);
  assert.match(oauth,/garage_external_calendar_tokens/);
  assert.match(oauth,/refresh_token_ciphertext/);
  assert.doesNotMatch(oauth,/GOOGLE_CALENDAR_CLIENT_SECRET=.*["'][^"']+["']/);
});
test('Google callback is limited to primary calendar and does not import/share data',()=>{
  assert.match(oauth,/x\.primary/);
  assert.match(oauth,/garage_external_calendar_connections/);
  assert.doesNotMatch(oauth,/from\("garage_schedule_events"\)/);
  assert.doesNotMatch(oauth,/\/calendars\/.*\/events/);
});

test('OAuth authorization and token exchange use identical public HTTPS callback, never internal req.url',()=>{
  const expected='https://nraijzsodgojkpyigefu.supabase.co/functions/v1/garage-calendar-oauth';
  assert.ok(oauth.includes('const GOOGLE_OAUTH_REDIRECT_URI="'+expected+'";'));
  const uses=oauth.match(/const redirectUri=GOOGLE_OAUTH_REDIRECT_URI;/g)||[];
  assert.equal(uses.length,2,'both start and callback must use public URI');
  assert.doesNotMatch(oauth,/redirectFor\(req\.url\)/);
  assert.doesNotMatch(oauth,/const redirectUri\s*=\s*new URL\(req\.url\)/);
});

test('disconnect validates live Supabase JWT, garage membership and exact connection owner',()=>{
 assert.match(oauth,/async function disconnect\(req:Request,body:Record<string,unknown>\)/);
 assert.match(oauth,/const userId=await getCaller\(req\)/);
 assert.match(oauth,/const membership=await rest\("garage_members","GET"/);
 assert.match(oauth,/id:"eq\."\+connectionId,garage_id:"eq\."\+garageId,\s*user_id:"eq\."\+userId,provider:"eq\.google"/);
 assert.match(oauth,/if\(!Array\.isArray\(matches\)\|\|matches\.length!==1\)/);
 assert.match(oauth,/if\(body\?\.action==="disconnect"\)return await disconnect\(req,body\)/);
});
test('disconnect deletes only selected owner-scoped connection and tokens cascade',()=>{
 assert.match(oauth,/rest\("garage_external_calendar_connections","DELETE"/);
 assert.match(oauth,/const removed=await rest/);
 assert.match(oauth,/if\(!Array\.isArray\(removed\)\|\|removed\.length!==1\)/);
 assert.match(oauth,/return json\(\{disconnected:true,google_access_revoked:revoked\}\)/);
 assert.match(oauth,/AES-GCM.*\["decrypt"\]/);
 assert.match(oauth,/https:\/\/oauth2\.googleapis\.com\/revoke/);
 assert.doesNotMatch(oauth,/console\.log\(.*refresh/);
});
