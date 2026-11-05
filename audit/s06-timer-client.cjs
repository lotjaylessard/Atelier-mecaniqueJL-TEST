"use strict";
/**
 * S06-F03 : adaptateur de synchronisation, isolé de index.html.
 * Aucun appel réseau au chargement. Toutes les opérations doivent recevoir
 * un client Supabase connecté; RLS/RPC doivent être validées côté serveur.
 * Ne modifie JAMAIS garage_data, les bons de travail ou les factures.
 */
class S06TimerError extends Error {
  constructor(code,message){super(message);this.name="S06TimerError";this.code=code;}
}
function ensureResponse(data,error){
  if(error)throw new S06TimerError(error.code==="40001"?"conflict":"remote",
    error.message||"Opération non confirmée");
  if(!data || typeof data!=="object" || Array.isArray(data) ||
     typeof data.id!=="string" || !data.id.trim() ||
     typeof data.user_id!=="string" || !data.user_id.trim() ||
     typeof data.garage_id!=="string" || !data.garage_id.trim() ||
     typeof data.work_order_id!=="string" || !data.work_order_id.trim() ||
     !Number.isSafeInteger(Number(data.revision)) || Number(data.revision)<0 ||
     !["paused","running","posted"].includes(data.status) ||
     !Number.isSafeInteger(Number(data.confirmed_ms)) || Number(data.confirmed_ms)<0 ||
     (data.status==="running" && typeof data.last_heartbeat_at!=="string") ||
     (data.status==="paused" && data.last_heartbeat_at!=null) ||
     (data.status==="posted" && (data.last_heartbeat_at!=null ||
       typeof data.posted_labor_id!=="string" || !data.posted_labor_id.trim())))
    throw new S06TimerError("invalid","Réponse Supabase invalide");
  return {...data,revision:Number(data.revision),confirmed_ms:Number(data.confirmed_ms)};
}
function createAdapter({client,uid,isOnline=()=>true}){
  if(!client || typeof client.rpc!=="function" ||
     typeof client.from!=="function" || typeof uid!=="string" || !uid)
    throw new TypeError("Client et utilisateur Supabase requis");
  let busy=false, cache=null, error=null;
  const assertOnline=()=>{if(!isOnline())throw new S06TimerError("offline","Connexion requise : temps non confirmé");};
  const withLock=async fn=>{
    if(busy)throw new S06TimerError("busy","Action précédente non confirmée");
    busy=true;
    try{assertOnline();const out=await fn();error=null;return out;}
    catch(e){error=e;throw e;}
    finally{busy=false;}
  };
  const read=async()=>withLock(async()=>{
    const {data,error:remoteError}=await client.from("garage_timer_sessions")
      .select("id,user_id,garage_id,work_order_id,status,confirmed_ms,last_heartbeat_at,revision,posted_labor_id,updated_at")
      .eq("user_id",uid).order("updated_at",{ascending:false});
    if(remoteError)throw new S06TimerError("remote",remoteError.message||"Lecture impossible");
    if(!Array.isArray(data)||data.some(row=>row.user_id!==uid))
      throw new S06TimerError("invalid","Sessions distantes non vérifiées");
    const rows=data.map(row=>ensureResponse(row,null));
    if(rows.filter(row=>row.status==="running").length>1)
      throw new S06TimerError("invalid","Deux sessions actives");
    cache=rows;return rows.map(row=>({...row}));
  });
  const transition=async({id,action,revision,workOrderId=null})=>withLock(async()=>{
    if(!["create","start","heartbeat","pause","recover"].includes(action))
      throw new S06TimerError("action","Action interdite");
    if(action==="create"){
      if(id!=null||revision!==0||typeof workOrderId!=="string"||!workOrderId.trim())
        throw new S06TimerError("action","Création invalide");
    }else{
      if(typeof id!=="string"||!id||!Number.isSafeInteger(revision)||revision<0||workOrderId!==null)
        throw new S06TimerError("action","Identifiant ou version invalide");
      // Revision connue obligatoire; refus sur session inconnue pour eviter mutations aveugles.
      const known=cache?.find(row=>row.id===id);
      if(!known||known.revision!==revision)
        throw new S06TimerError("stale","Recharger les sessions avant de continuer");
    }
    const {data,error:remoteError}=await client.rpc("s06_timer_transition",{
      p_id:id||null,p_action:action,p_expected_revision:revision,p_work_order_id:workOrderId
    });
    const confirmed=ensureResponse(data,remoteError);
    if(confirmed.user_id!==uid)
      throw new S06TimerError("invalid","Compte de retour différent");
    if(action==="create" && (confirmed.work_order_id!==workOrderId.trim() ||
         confirmed.status!=="paused" || confirmed.revision!==0 ||
         confirmed.confirmed_ms!==0))
      throw new S06TimerError("invalid","Création distante incohérente");
    if(action==="create"){
      cache=[confirmed,...(cache||[])];
    }else{
      if(confirmed.id!==id || confirmed.revision!==revision+1)
        throw new S06TimerError("invalid","Accusé de réception incohérent");
      cache=cache.map(row=>row.id===id?confirmed:row);
    }
    return {...confirmed};
  });
  return {read,transition,get busy(){return busy;},get lastError(){return error;},
    get snapshot(){return cache?.map(row=>({...row}))||null;}};
}
module.exports={createAdapter,S06TimerError,ensureResponse};
