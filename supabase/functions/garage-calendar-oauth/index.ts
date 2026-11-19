// Garage S09 TEST — Google Calendar OAuth. Server-only state and AES-GCM encrypted refresh tokens.
// This endpoint has verify_jwt=false ONLY because Google redirects back without a Supabase JWT.
// POST /start individually verifies the Supabase user's bearer token and garage membership.
// All secrets remain Supabase Edge Function environment variables. NO credentials in HTML/GitHub.
const dbUrl=Deno.env.get("SUPABASE_URL")||"";
function projectKey(legacy:string,modern:string){
 const legacyKey=Deno.env.get(legacy)||"";
 if(legacyKey)return legacyKey;
 try{
  const keys=JSON.parse(Deno.env.get(modern)||"{}");
  return typeof keys.default==="string"?keys.default:"";
 }catch{return "";}
}
const serviceKey=projectKey("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
const anonKey=projectKey("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
const clientId=Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")||"";
const clientSecret=Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")||"";
const tokenKey=Deno.env.get("GOOGLE_CALENDAR_ENCRYPTION_KEY_HEX")||"";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ready=()=>Boolean(dbUrl&&serviceKey&&anonKey&&clientId&&clientSecret&&/^[0-9a-f]{64}$/i.test(tokenKey));
const json=(value:unknown,code=200)=>new Response(JSON.stringify(value),{status:code,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
// The Supabase Edge gateway can render callback HTML as literal text in some browsers.
// Return readable UTF-8 plain text instead of showing raw markup.
const html=(message:string,code=200)=>new Response(
 "GARAGE — CALENDRIER GOOGLE TEST\n\n"+message+
 "\n\nRetourne dans ton garage TEST : Paramètres → Calendriers personnels — connexions.",
 {status:code,headers:{...cors,"Content-Type":"text/plain; charset=utf-8","Referrer-Policy":"no-referrer"}});
const bytes=(len:number)=>crypto.getRandomValues(new Uint8Array(len));
const base64url=(a:Uint8Array)=>btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const sha=async(str:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str)));
const hex=(a:Uint8Array)=>Array.from(a,x=>x.toString(16).padStart(2,"0")).join("");
// A Supabase Edge Function may receive an internal HTTP URL and a rewritten pathname.
// OAuth redirects MUST use the exact public HTTPS URI registered at Google, never req.url.
const GOOGLE_OAUTH_REDIRECT_URI="https://nraijzsodgojkpyigefu.supabase.co/functions/v1/garage-calendar-oauth";
async function rest(table:string,method:string,params:Record<string,string>|null,body?:unknown,extra:Record<string,string>={}){
 const u=new URL(dbUrl+"/rest/v1/"+table);
 for(const [k,v] of Object.entries(params||{}))u.searchParams.set(k,v);
 const response=await fetch(u,{method,headers:{"apikey":serviceKey,"Authorization":"Bearer "+serviceKey,"Content-Type":"application/json","Prefer":method==="POST"?"resolution=merge-duplicates,return=representation":"return=representation",...extra},body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok)throw Error("La base TEST a refusé l'opération ("+response.status+")");
 return response.status===204?[]:await response.json();
}
async function getCaller(req:Request){
 const bearer=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
 if(!bearer||!anonKey)throw Error("Utilisateur non authentifié");
 const res=await fetch(dbUrl+"/auth/v1/user",{headers:{"Authorization":"Bearer "+bearer,"apikey":anonKey}});
 if(!res.ok)throw Error("Session expirée");
 const data=await res.json();
 if(!uuid.test(String(data.id||"")))throw Error("Compte invalide");
 return String(data.id);
}
async function encryptToken(value:string){
 const keyBytes=Uint8Array.from(tokenKey.match(/.{2}/g)!.map(x=>parseInt(x,16)));
 const key=await crypto.subtle.importKey("raw",keyBytes,"AES-GCM",false,["encrypt"]);
 const iv=bytes(12);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(value)));
 return {refresh_token_ciphertext:btoa(String.fromCharCode(...encrypted)),refresh_token_nonce:btoa(String.fromCharCode(...iv))};
}
async function decryptRefreshToken(ciphertext:string,nonce:string){
 const keyBytes=Uint8Array.from(tokenKey.match(/.{2}/g)!.map(x=>parseInt(x,16)));
 const key=await crypto.subtle.importKey("raw",keyBytes,"AES-GCM",false,["decrypt"]);
 const iv=Uint8Array.from(atob(nonce),x=>x.charCodeAt(0));
 const encrypted=Uint8Array.from(atob(ciphertext),x=>x.charCodeAt(0));
 const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,encrypted);
 return new TextDecoder().decode(raw);
}
async function disconnect(req:Request,body:Record<string,unknown>){
 // Deleting a connection also cascade-deletes its encrypted token and private event cache.
 // Only the authenticated connection owner may request it, never by an untrusted user id.
 if(!serviceKey||!anonKey)return json({error:"Service TEST indisponible"},503);
 const userId=await getCaller(req);
 const garageId=String(body?.garage_id||""),connectionId=String(body?.connection_id||"");
 if(!uuid.test(garageId)||!uuid.test(connectionId))return json({error:"Identifiant de connexion invalide"},400);
 const membership=await rest("garage_members","GET",{
  select:"garage_id",garage_id:"eq."+garageId,user_id:"eq."+userId,limit:"1"
 });
 if(!Array.isArray(membership)||membership.length!==1)return json({error:"Accès au garage refusé"},403);
 const matches=await rest("garage_external_calendar_connections","GET",{
  select:"id",id:"eq."+connectionId,garage_id:"eq."+garageId,
  user_id:"eq."+userId,provider:"eq.google",limit:"1"
 });
 if(!Array.isArray(matches)||matches.length!==1)
  return json({error:"Connexion personnelle introuvable"},404);
 // Attempt to revoke the Google grant. If Google is unavailable, we still forget
 // the encrypted token locally, and instruct the user how to revoke from Google.
 let revoked=false;
 if(/^[0-9a-f]{64}$/i.test(tokenKey)){
  try{
   const rows=await rest("garage_external_calendar_tokens","GET",{
    select:"refresh_token_ciphertext,refresh_token_nonce",connection_id:"eq."+connectionId,limit:"1"
   });
   if(Array.isArray(rows)&&rows.length===1){
    const refresh=await decryptRefreshToken(rows[0].refresh_token_ciphertext,rows[0].refresh_token_nonce);
    const response=await fetch("https://oauth2.googleapis.com/revoke",{
     method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
     body:new URLSearchParams({token:refresh}),signal:AbortSignal.timeout(8000)
    });
    revoked=response.ok;
   }
  }catch(_err){/* A failed remote revoke must not block removal of local access. */}
 }
 const removed=await rest("garage_external_calendar_connections","DELETE",{
  id:"eq."+connectionId,garage_id:"eq."+garageId,user_id:"eq."+userId,provider:"eq.google"
 });
 if(!Array.isArray(removed)||removed.length!==1)
  return json({error:"La suppression de la connexion n'a pas été confirmée"},500);
 return json({disconnected:true,google_access_revoked:revoked});
}
async function start(req:Request,provided?:Record<string,unknown>){
 if(!ready())return json({error:"Connexion Google TEST non configurée : identifiants OAuth manquants."},503);
 const userId=await getCaller(req);
 const body=provided||await req.json().catch(()=>({}));
 const garageId=String(body?.garage_id||"");
 if(!uuid.test(garageId))return json({error:"Garage invalide"},400);
 const membership=await rest("garage_members","GET",{select:"garage_id",garage_id:"eq."+garageId,user_id:"eq."+userId,limit:"1"});
 if(!Array.isArray(membership)||membership.length!==1)return json({error:"Accès au garage refusé"},403);
 const state=base64url(bytes(32)),verifier=base64url(bytes(48));
 const hashed=hex(await sha(state)),challenge=base64url(await sha(verifier));
 await rest("garage_external_oauth_states","POST",null,{
  state_hash:hashed,user_id:userId,garage_id:garageId,provider:"google",pkce_verifier:verifier,
  expires_at:new Date(Date.now()+10*60*1000).toISOString()
 });
 const redirectUri=GOOGLE_OAUTH_REDIRECT_URI;
 const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
 for(const [key,val] of Object.entries({
  client_id:clientId,redirect_uri:redirectUri,response_type:"code",
  scope:"https://www.googleapis.com/auth/calendar.readonly",access_type:"offline",
  prompt:"consent",state,code_challenge:challenge,code_challenge_method:"S256"
 }))url.searchParams.set(key,val);
 return json({authorization_url:url.toString()});
}
async function callback(req:Request){
 const query=new URL(req.url).searchParams;
 const state=query.get("state")||"",code=query.get("code")||"";
 if(!state||state.length>200)return html("La demande a expiré ou son état est invalide.",400);
 // Consume state *before* requesting provider tokens: one-time and bound to garage + user.
 const stateHash=hex(await sha(state));
 const rows=await rest("garage_external_oauth_states","GET",{select:"state_hash,user_id,garage_id,provider,pkce_verifier,expires_at",state_hash:"eq."+stateHash,limit:"1"});
 if(!Array.isArray(rows)||rows.length!==1)return html("Demande introuvable ou déjà utilisée.",400);
 const record=rows[0];
 await rest("garage_external_oauth_states","DELETE",{state_hash:"eq."+stateHash},undefined,{"Prefer":"return=minimal"});
 if(record.provider!=="google"||new Date(record.expires_at).getTime()<=Date.now())return html("Demande expirée.",400);
 if(query.get("error"))return html("Autorisation Google refusée ou annulée.",400);
 if(!code||code.length>4096||!ready())return html("La configuration Google TEST est incomplète.",503);
 const redirectUri=GOOGLE_OAUTH_REDIRECT_URI;
 const form=new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:"authorization_code",code_verifier:record.pkce_verifier});
 const exchange=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
 if(!exchange.ok)return html("Google n'a pas confirmé la connexion. Vérifie la configuration OAuth TEST.",400);
 const tokens=await exchange.json();
 if(typeof tokens.refresh_token!=="string"||typeof tokens.access_token!=="string")return html("Google n'a pas fourni de renouvellement d'accès. Réessaie en autorisant l'accès.",400);
 const calendars=await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100",{headers:{"Authorization":"Bearer "+tokens.access_token}});
 if(!calendars.ok)return html("Connexion obtenue, mais la liste des calendriers n'est pas accessible.",502);
 const list=await calendars.json();
 const primary=Array.isArray(list.items)?(list.items.find((x:{primary?:boolean})=>x.primary)||list.items[0]):null;
 const calendarId=String(primary?.id||"");
 if(!calendarId||calendarId.length>512)return html("Aucun calendrier accessible pour ce compte.",400);
 const sealed=await encryptToken(tokens.refresh_token);
 const matches=await rest("garage_external_calendar_connections","GET",{
  select:"id",garage_id:"eq."+record.garage_id,user_id:"eq."+record.user_id,
  provider:"eq.google",calendar_id:"eq."+calendarId,limit:"1"
 });
 let connectionId=matches?.[0]?.id;
 if(!connectionId){
  const created=await rest("garage_external_calendar_connections","POST",null,{
   garage_id:record.garage_id,user_id:record.user_id,provider:"google",calendar_id:calendarId,
   display_name:String(primary?.summary||"Google Calendar").slice(0,100),sync_status:"not_connected"
  });
  connectionId=created?.[0]?.id;
 }
 if(!uuid.test(String(connectionId||"")))return html("La connexion n'a pas pu être enregistrée.",500);
 await rest("garage_external_calendar_tokens","POST",{on_conflict:"connection_id"},{
  connection_id:connectionId,...sealed,updated_at:new Date().toISOString()
 });
 await rest("garage_external_calendar_connections","PATCH",{id:"eq."+connectionId},{
  sync_status:"connected",updated_at:new Date().toISOString()
 });
 return html("Connexion Google autorisée et enregistrée dans le TEST. Aucune modification de ton agenda Google n'a été effectuée.");
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 try{
  const u=new URL(req.url);
  if(req.method==="GET"&&u.searchParams.has("state"))return await callback(req);
  if(req.method==="GET")return json({google_available:ready(),phase:"test",read_only:true});
  if(req.method==="POST"){
   const body=await req.json().catch(()=>({}));
   if(body?.action==="disconnect")return await disconnect(req,body);
   if(body?.action===undefined||body?.action==="connect")return await start(req,body);
   return json({error:"Action inconnue"},400);
  }
  return json({error:"Méthode non permise"},405);
 }catch(_err){
  // Never echo OAuth codes, provider responses, tokens, user data or secrets in error text.
  return json({error:"Connexion Google TEST indisponible. Vérifie la configuration."},500);
 }
});
