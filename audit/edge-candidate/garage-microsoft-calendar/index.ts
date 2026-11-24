// Garage PROD — Microsoft Outlook/Hotmail OAuth, private read-only sync.
const url=Deno.env.get("SUPABASE_URL")||"";
function envKey(a:string,b:string){const v=Deno.env.get(a);if(v)return v;try{const x=JSON.parse(Deno.env.get(b)||"{}");return String(x.default||"")}catch{return ""}}
const service=envKey("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
const pub=envKey("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
const client=Deno.env.get("MICROSOFT_CALENDAR_CLIENT_ID")||"";
const secret=Deno.env.get("MICROSOFT_CALENDAR_CLIENT_SECRET")||"";
const keyHex=Deno.env.get("GOOGLE_CALENDAR_ENCRYPTION_KEY_HEX")||"";
const redirect=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"")+"/functions/v1/garage-microsoft-calendar";
const domain="https://login.microsoftonline.com/consumers/oauth2/v2.0";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ready=()=>!!(url&&service&&pub&&client&&secret&&/^[a-f0-9]{64}$/i.test(keyHex));
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
const message=(msg:string,status=200)=>new Response("GARAGE PROD — OUTLOOK / HOTMAIL\n\n"+msg+"\n\nRetourne dans Paramètres → Calendriers personnels.",{status,headers:{...cors,"Content-Type":"text/plain; charset=utf-8","Referrer-Policy":"no-referrer"}});
function b64(a:Uint8Array){return btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function rnd(n:number){return crypto.getRandomValues(new Uint8Array(n))}
async function hash(s:string){return new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))}
async function stateHash(s:string){return Array.from(await hash(s),x=>x.toString(16).padStart(2,"0")).join("")}
async function db(t:string,method:string,q:Record<string,string>={},body?:unknown){
 const u=new URL(url+"/rest/v1/"+t);Object.entries(q).forEach(([k,v])=>u.searchParams.set(k,v));
 const r=await fetch(u,{method,headers:{"apikey":service,"Authorization":"Bearer "+service,"Content-Type":"application/json","Prefer":method==="POST"?"resolution=merge-duplicates,return=representation":"return=representation"},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)throw Error("Database rejected "+r.status);
 return r.status===204?[]:r.json();
}
async function caller(req:Request,garageId:string){
 if(!uuid.test(garageId))throw Error("Invalid garage");
 const token=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)throw Error("Missing token");
 const r=await fetch(url+"/auth/v1/user",{headers:{"apikey":pub,"Authorization":"Bearer "+token}});
 if(!r.ok)throw Error("Invalid session");
 const data=await r.json(),id=String(data.id||"");
 if(!uuid.test(id))throw Error("Invalid user");
 const rows=await db("garage_members","GET",{select:"garage_id",garage_id:"eq."+garageId,user_id:"eq."+id,limit:"1"});
 if(rows.length!==1)throw Error("Not a member");
 return id;
}
async function aes(){return crypto.subtle.importKey("raw",Uint8Array.from(keyHex.match(/.{2}/g)!.map(x=>parseInt(x,16))),"AES-GCM",false,["encrypt","decrypt"])}
async function seal(s:string){const iv=rnd(12);const data=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await aes(),new TextEncoder().encode(s)));return {refresh_token_ciphertext:btoa(String.fromCharCode(...data)),refresh_token_nonce:btoa(String.fromCharCode(...iv))}}
async function open(row:{refresh_token_ciphertext:string,refresh_token_nonce:string}){const iv=Uint8Array.from(atob(row.refresh_token_nonce),x=>x.charCodeAt(0));const data=Uint8Array.from(atob(row.refresh_token_ciphertext),x=>x.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv},await aes(),data))}
async function exchange(form:URLSearchParams){const r=await fetch(domain+"/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form,signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error("Microsoft token exchange rejected");return r.json()}
async function graph(endpoint:string,access:string){
 if(!endpoint.startsWith("https://graph.microsoft.com/v1.0/"))throw Error("Invalid Graph endpoint");
 const r=await fetch(endpoint,{headers:{"Authorization":"Bearer "+access,"Prefer":'outlook.timezone="UTC"'},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error("Microsoft Graph rejected "+r.status);
 return r.json();
}
async function owned(user:string,garage:string,id:string){
 if(!uuid.test(id))throw Error("Invalid connection");
 const c=await db("garage_external_calendar_connections","GET",{select:"id,calendar_id,last_synced_at",id:"eq."+id,garage_id:"eq."+garage,user_id:"eq."+user,provider:"eq.microsoft",limit:"1"});
 if(c.length!==1)throw Error("Connection not found");
 return c[0];
}
async function accessToken(id:string){
 const row=await db("garage_external_calendar_tokens","GET",{select:"refresh_token_ciphertext,refresh_token_nonce",connection_id:"eq."+id,limit:"1"});
 if(row.length!==1)throw Error("Token missing");
 const refresh=await open(row[0]);
 const result=await exchange(new URLSearchParams({client_id:client,client_secret:secret,grant_type:"refresh_token",refresh_token:refresh,scope:"offline_access User.Read Calendars.Read"}));
 if(!result.access_token)throw Error("Microsoft needs reconnection");
 if(result.refresh_token&&result.refresh_token!==refresh)await db("garage_external_calendar_tokens","POST",{on_conflict:"connection_id"},{connection_id:id,...await seal(result.refresh_token),updated_at:new Date().toISOString()});
 return String(result.access_token);
}
function localDate(iso:string){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(iso))}
function minusDay(s:string){const d=new Date(s+"T12:00:00Z");d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
async function sync(user:string,garage:string,id:string,force=false){
 const c=await owned(user,garage,id);
 if(!force&&c.last_synced_at&&Date.now()-new Date(c.last_synced_at).getTime()<15*60*1000)return {synced:true,cached:true};
 let access:string;
 try{access=await accessToken(id)}catch(e){await db("garage_external_calendar_connections","PATCH",{id:"eq."+id,user_id:"eq."+user},{sync_status:"needs_reconnect"});throw e}
 const now=new Date(),min=new Date(now.getFullYear()-1,0,1).toISOString(),max=new Date(now.getFullYear()+2,11,31,23,59,59).toISOString();
 let endpoint="https://graph.microsoft.com/v1.0/me/calendarView?"+new URLSearchParams({startDateTime:min,endDateTime:max,"$top":"100","$select":"id,subject,start,end,isAllDay,isCancelled"}).toString();
 const rows:any[]=[];let pages=0;
 while(endpoint&&pages++<30){
  const data=await graph(endpoint,access);
  if(!Array.isArray(data.value))throw Error("Invalid events");
  for(const e of data.value){
   if(e.isCancelled||!e.id||!e.start?.dateTime||!e.end?.dateTime)continue;
   // Graph is requested in UTC. Treat UTC wall clock strings as UTC instants.
   const from=String(e.start.dateTime).replace(/Z$/,"").slice(0,19)+"Z";
   const to=String(e.end.dateTime).replace(/Z$/,"").slice(0,19)+"Z";
   if(!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to)))continue;
   const startDate=e.isAllDay?from.slice(0,10):localDate(from);
   const endDate=e.isAllDay?minusDay(to.slice(0,10)):localDate(new Date(Date.parse(to)-1).toISOString());
   rows.push({connection_id:id,garage_id:garage,user_id:user,provider_event_id:String(e.id).slice(0,512),event_title:String(e.subject||"Événement Outlook").slice(0,400),start_date:startDate,end_date:endDate<startDate?startDate:endDate,all_day:!!e.isAllDay,start_at:e.isAllDay?null:from,end_at:e.isAllDay?null:to});
   if(rows.length>2500)throw Error("Too many events");
  }
  const next=data["@odata.nextLink"];
  endpoint=typeof next==="string"&&next.startsWith("https://graph.microsoft.com/v1.0/")?next:"";
 }
 if(endpoint)throw Error("Calendar pagination limit reached");
 await db("garage_external_calendar_events","DELETE",{connection_id:"eq."+id,garage_id:"eq."+garage,user_id:"eq."+user});
 for(let i=0;i<rows.length;i+=100)await db("garage_external_calendar_events","POST",{},rows.slice(i,i+100));
 await db("garage_external_calendar_connections","PATCH",{id:"eq."+id,user_id:"eq."+user,garage_id:"eq."+garage},{sync_status:"connected",last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()});
 return {synced:true,count:rows.length};
}
async function connect(req:Request,body:any){
 if(!ready())return json({error:"Outlook PROD : configuration OAuth Microsoft requise."},503);
 const garage=String(body.garage_id||""),user=await caller(req,garage);
 const state=b64(rnd(32)),verifier=b64(rnd(48));
 await db("garage_external_oauth_states","POST",{}, {state_hash:await stateHash(state),garage_id:garage,user_id:user,provider:"microsoft",pkce_verifier:verifier,expires_at:new Date(Date.now()+600000).toISOString()});
 const u=new URL(domain+"/authorize");
 Object.entries({client_id:client,response_type:"code",redirect_uri:redirect,response_mode:"query",scope:"openid profile offline_access User.Read Calendars.Read",state,code_challenge:b64(await hash(verifier)),code_challenge_method:"S256",prompt:"select_account"}).forEach(([k,v])=>u.searchParams.set(k,v));
 return json({authorization_url:u.toString()});
}
async function callback(req:Request){
 const q=new URL(req.url).searchParams,state=q.get("state")||"",code=q.get("code")||"";
 if(!state||state.length>200)return message("Demande invalide.",400);
 const sh=await stateHash(state),matches=await db("garage_external_oauth_states","GET",{select:"state_hash,garage_id,user_id,provider,pkce_verifier,expires_at",state_hash:"eq."+sh,limit:"1"});
 if(matches.length!==1)return message("Demande expirée ou déjà utilisée.",400);
 const item=matches[0];
 await db("garage_external_oauth_states","DELETE",{state_hash:"eq."+sh});
 if(item.provider!=="microsoft"||Date.parse(item.expires_at)<Date.now()||q.has("error")||!code||code.length>4096||!ready())return message("Autorisation annulée ou expirée.",400);
 const tokens=await exchange(new URLSearchParams({client_id:client,client_secret:secret,redirect_uri:redirect,grant_type:"authorization_code",code,code_verifier:item.pkce_verifier}));
 if(!tokens.access_token||!tokens.refresh_token)return message("Microsoft n'a pas fourni d'autorisation renouvelable.",400);
 const cal=await graph("https://graph.microsoft.com/v1.0/me/calendar",tokens.access_token);
 const id=String(cal.id||"");if(!id||id.length>512)return message("Calendrier Microsoft indisponible.",400);
 const old=await db("garage_external_calendar_connections","GET",{select:"id",garage_id:"eq."+item.garage_id,user_id:"eq."+item.user_id,provider:"eq.microsoft",limit:"1"});
 // one personal Outlook calendar per garage user; avoids leaking old calendar events
 if(old.length)await db("garage_external_calendar_connections","DELETE",{id:"eq."+old[0].id,garage_id:"eq."+item.garage_id,user_id:"eq."+item.user_id});
 const created=await db("garage_external_calendar_connections","POST",{}, {garage_id:item.garage_id,user_id:item.user_id,provider:"microsoft",calendar_id:id,display_name:String(cal.name||"Outlook / Hotmail").slice(0,100),sync_status:"connected"});
 const connection=created?.[0]?.id;if(!uuid.test(String(connection||"")))return message("Connexion non enregistrée.",500);
 await db("garage_external_calendar_tokens","POST",{on_conflict:"connection_id"},{connection_id:connection,...await seal(tokens.refresh_token),updated_at:new Date().toISOString()});
 try{await sync(item.user_id,item.garage_id,connection,true)}catch{ /* Connection remains, next refresh can retry. */ }
 return message("Connexion Outlook autorisée dans PROD. Retourne au garage et actualise Horaire.");
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 try{
  if(req.method==="GET"&&new URL(req.url).searchParams.has("state"))return await callback(req);
  if(req.method==="GET")return json({microsoft_available:ready(),read_only:true,phase:"PROD"});
  if(req.method!=="POST")return json({error:"Méthode refusée"},405);
  const body=await req.json().catch(()=>({})),action=String(body.action||"connect");
  if(action==="connect")return await connect(req,body);
  const garage=String(body.garage_id||""),user=await caller(req,garage),id=String(body.connection_id||"");
  if(action==="sync")return json(await sync(user,garage,id));
  if(action==="disconnect"){
   await owned(user,garage,id);
   const removed=await db("garage_external_calendar_connections","DELETE",{id:"eq."+id,garage_id:"eq."+garage,user_id:"eq."+user,provider:"eq.microsoft"});
   if(removed.length!==1)throw Error("Delete failed");
   return json({disconnected:true});
  }
  return json({error:"Action inconnue"},400);
 }catch(_e){return json({error:"Outlook PROD : opération impossible. Vérifie la connexion Microsoft."},400)}
});