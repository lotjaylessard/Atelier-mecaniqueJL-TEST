// S09 TEST — FamilyWall iCal, read-only private feed. Never expose iCal URL to client.
import {parseFamilyWallICS,validateFamilyWallUrl} from "./ics.js";
const dbUrl=Deno.env.get("SUPABASE_URL")||"";
const envKey=(legacy:string,modern:string)=>{
 const a=Deno.env.get(legacy)||"";if(a)return a;
 try{const j=JSON.parse(Deno.env.get(modern)||"{}");return typeof j.default==="string"?j.default:"";}catch{return "";}
};
const serviceKey=envKey("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
const anonKey=envKey("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
const keyHex=Deno.env.get("GOOGLE_CALENDAR_ENCRYPTION_KEY_HEX")||"";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const respond=(payload:unknown,code=200)=>new Response(JSON.stringify(payload),{status:code,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
function configured(){return Boolean(dbUrl&&serviceKey&&anonKey&&/^[a-f0-9]{64}$/i.test(keyHex));}
async function rest(table:string,method:string,query:Record<string,string>|null,body?:unknown){
 const url=new URL(dbUrl+"/rest/v1/"+table);
 for(const [k,v] of Object.entries(query||{}))url.searchParams.set(k,v);
 const res=await fetch(url,{method,headers:{"apikey":serviceKey,"Authorization":"Bearer "+serviceKey,"Content-Type":"application/json","Prefer":method==="POST"?"resolution=merge-duplicates,return=representation":"return=representation"},body:body===undefined?undefined:JSON.stringify(body)});
 if(!res.ok)throw Error("Erreur de stockage sécurisé ("+res.status+")");
 return res.status===204?[]:await res.json();
}
async function authenticated(req:Request,garageId:string){
 if(!uuid.test(garageId))throw Error("Garage invalide");
 const token=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)throw Error("Session absente");
 const response=await fetch(dbUrl+"/auth/v1/user",{headers:{"apikey":anonKey,"Authorization":"Bearer "+token}});
 if(!response.ok)throw Error("Session expirée");
 const account=await response.json();
 const userId=String(account.id||"");
 if(!uuid.test(userId))throw Error("Utilisateur invalide");
 const membership=await rest("garage_members","GET",{select:"garage_id",garage_id:"eq."+garageId,user_id:"eq."+userId,limit:"1"});
 if(!Array.isArray(membership)||membership.length!==1)throw Error("Membre non autorisé");
 return userId;
}
async function key(){
 const raw=Uint8Array.from(keyHex.match(/.{2}/g)!.map(v=>parseInt(v,16)));
 return await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
}
async function seal(value:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},await key(),new TextEncoder().encode(value));
 return {url_ciphertext:btoa(String.fromCharCode(...new Uint8Array(encrypted))),url_nonce:btoa(String.fromCharCode(...iv))};
}
async function unseal(row:{url_ciphertext:string,url_nonce:string}){
 const iv=Uint8Array.from(atob(row.url_nonce),x=>x.charCodeAt(0));
 const bytes=Uint8Array.from(atob(row.url_ciphertext),x=>x.charCodeAt(0));
 const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv},await key(),bytes);
 return new TextDecoder().decode(plaintext);
}
async function connectionFor(userId:string,garageId:string,connectionId:string){
 if(!uuid.test(connectionId))throw Error("Connexion invalide");
 const matches=await rest("garage_external_calendar_connections","GET",{
  select:"id,last_synced_at",id:"eq."+connectionId,user_id:"eq."+userId,garage_id:"eq."+garageId,provider:"eq.familywall",limit:"1"
 });
 if(!Array.isArray(matches)||matches.length!==1)throw Error("Connexion FamilyWall introuvable");
 return matches[0];
}
async function refresh(userId:string,garageId:string,connectionId:string,force=false){
 const c=await connectionFor(userId,garageId,connectionId);
 if(!force&&c.last_synced_at&&Date.now()-new Date(c.last_synced_at).getTime()<15*60*1000)
  return {synced:true,cached:true};
 const secrets=await rest("garage_familywall_feed_secrets","GET",{
  select:"url_ciphertext,url_nonce",connection_id:"eq."+connectionId,limit:"1"
 });
 if(!Array.isArray(secrets)||secrets.length!==1)throw Error("Lien FamilyWall absent");
 const feedUrl=validateFamilyWallUrl(await unseal(secrets[0]));
 const response=await fetch(feedUrl,{
  method:"GET",headers:{"Accept":"text/calendar"},
  redirect:"error",signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw Error("FamilyWall n'a pas renvoyé le calendrier ("+response.status+")");
 const announced=Number(response.headers.get("content-length")||"0");
 if(announced>2_000_000)throw Error("Calendrier trop volumineux");
 const text=await response.text();
 if(text.length>2_000_000)throw Error("Calendrier trop volumineux");
 const now=new Date(),first=new Date(now.getFullYear()-1,0,1),last=new Date(now.getFullYear()+2,11,31);
 const min=first.toISOString().slice(0,10),max=last.toISOString().slice(0,10);
 const items=parseFamilyWallICS(text,{min,max});
 const rows=items.map(e=>({...e,connection_id:connectionId,garage_id:garageId,user_id:userId}));
 // A parsed and valid feed may intentionally be empty: clear stale cache.
 await rest("garage_external_calendar_events","DELETE",{connection_id:"eq."+connectionId,garage_id:"eq."+garageId,user_id:"eq."+userId});
 // Upload only bounded batches; no personal data logged.
 for(let i=0;i<rows.length;i+=100){
  await rest("garage_external_calendar_events","POST",null,rows.slice(i,i+100));
 }
 await rest("garage_external_calendar_connections","PATCH",{
  id:"eq."+connectionId,user_id:"eq."+userId,garage_id:"eq."+garageId
 },{sync_status:"connected",last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()});
 return {synced:true,count:items.length};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method==="GET")return respond({available:configured(),provider:"familywall",mode:"read_only",phase:"TEST"});
 if(req.method!=="POST")return respond({error:"Méthode non permise"},405);
 if(!configured())return respond({error:"Serveur FamilyWall TEST non configuré"},503);
 const body=await req.json().catch(()=>({}));
 const action=String(body?.action||"");
 const garageId=String(body?.garage_id||"");
 let userId:string;
 try{userId=await authenticated(req,garageId);}
 catch(_e){return respond({error:"Compte ou garage non autorisé"},403);}
 try{
  if(action==="connect"){
   const feedUrl=validateFamilyWallUrl(String(body?.ical_url||""));
   const stored=await rest("garage_external_calendar_connections","GET",{
    select:"id",garage_id:"eq."+garageId,user_id:"eq."+userId,provider:"eq.familywall",limit:"1"
   });
   let connectionId=stored?.[0]?.id;
   if(!connectionId){
    const created=await rest("garage_external_calendar_connections","POST",null,{
     garage_id:garageId,user_id:userId,provider:"familywall",calendar_id:"familywall-circle",
     display_name:"FamilyWall — familial",sync_status:"not_connected"
    });
    connectionId=created?.[0]?.id;
   }
   if(!uuid.test(String(connectionId||"")))throw Error("Connexion non enregistrée");
   await rest("garage_familywall_feed_secrets","POST",{on_conflict:"connection_id"},{
    connection_id:connectionId,...await seal(feedUrl),updated_at:new Date().toISOString()
   });
   // A valid feed is required before calling the connection synced.
   const synced=await refresh(userId,garageId,connectionId,true);
   return respond({connected:true,...synced});
  }
  if(action==="sync"){
   const connectionId=String(body?.connection_id||"");
   const synced=await refresh(userId,garageId,connectionId);
   return respond(synced);
  }
  if(action==="disconnect"){
   const connectionId=String(body?.connection_id||"");
   await connectionFor(userId,garageId,connectionId);
   const deleted=await rest("garage_external_calendar_connections","DELETE",{
    id:"eq."+connectionId,garage_id:"eq."+garageId,user_id:"eq."+userId,provider:"eq.familywall"
   });
   if(!Array.isArray(deleted)||deleted.length!==1)throw Error("Suppression non confirmée");
   return respond({disconnected:true});
  }
  return respond({error:"Action inconnue"},400);
 }catch(_error){
  // Never leak the iCal URL, event contents or user-specific details in errors or logs.
  return respond({error:"FamilyWall : opération impossible. Vérifie le lien iCal et réessaie."},400);
 }
});
