"use strict";
/* S06-F07 : panneau sous Menu relié aux sessions Supabase.
 * Activé uniquement avec ?s06_wo_pilot=1 sur TEST.
 * LECTURE SEULE : aucune écriture, aucun démarrage/heartbeat.
 * L'ancien miroir gère les modes hors pilote.
 */
(() => {
  if(new URLSearchParams(location.search).get("s06_wo_pilot")!=="1")return;
  const box=document.getElementById("s06SidebarTimer");
  const status=document.getElementById("s06TimerStatus");
  const number=document.getElementById("s06TimerWorkOrder");
  const vehicle=document.getElementById("s06TimerVehicle");
  const desc=document.querySelector("#s06TimerDescription span");
  const time=document.getElementById("s06TimerTime");
  const hint=box?.querySelector(".s06-timer-hint");
  const toggle=document.getElementById("s06SidebarToggle");
  const stop=document.getElementById("s06SidebarStop");
  // Les commandes du pilote restent désactivées sans confirmation de
  // la session du même BT. Ne pas appeler la minuterie locale historique.
  if(toggle)toggle.disabled=true;
  if(stop)stop.disabled=true;
  if(!box||!status||!number||!vehicle||!desc||!time)return;
  if(hint)hint.textContent="Temps confirmé par Supabase toutes les 10 s; affichage fluide indicatif.";
  const pad=n=>String(n).padStart(2,"0");
  const formatted=ms=>{
    const total=Math.floor(Math.max(0,Number(ms)||0)/1000);
    return pad(Math.floor(total/3600))+":"+pad(Math.floor(total/60)%60)+":"+pad(total%60);
  };
  let current=null,receivedAt=0,busy=false,uid=null,garage=null;
  let lastRenderedId=null,lastRenderedMs=0,actionPending=false;
  let pendingAction=null,pendingFrozenMs=0;
  const reconnectKey="s06-sidebar-reconnect-v1";
  const details=box.querySelector(".s06-timer-details");
  const clearCached=()=>{try{sessionStorage.removeItem(reconnectKey);}catch(_){}};
  const hide=()=>{
    current=null;lastRenderedId=null;lastRenderedMs=0;
    clearCached();box.hidden=true;
    delete box.dataset.pendingRestore;
  };
  function rememberVerified(){
    // À conserver uniquement pour un affichage d'attente au même onglet.
    // Jamais considéré comme une preuve que la minuterie continue de tourner.
    if(!current||!uid||!garage)return;
    try{sessionStorage.setItem(reconnectKey,JSON.stringify({
      at:Date.now(),user:uid,garage,id:current.id,
      ms:Number(current.confirmed_ms),status:current.status
    }));}catch(_){}
  }
  function metadata(id){
    try{
      const wo=(typeof WORKORDERS!=="undefined"&&Array.isArray(WORKORDERS))
        ?WORKORDERS.find(w=>w&&String(w.id)===String(id)):null;
      if(!wo||wo.status!=="en_cours")return null;
      return {id:String(wo.id),number:String(wo.number||"—"),
        vehicle:String(wo.vehicleLabel||"—"),
        description:String(wo.description||wo.desc||"—")};
    }catch(_ignored){return null;}
  }
  function paint(){
    // L'ancienne boucle masquait le panneau chaque 250 ms AVANT que
    // Supabase soit prêt : cause du délai visible après rafraîchissement.
    if(!current){
      if(box.dataset.pendingRestore==="1"){
        box.hidden=false;
        if(toggle)toggle.disabled=true;
        if(stop)stop.disabled=true;
      }else box.hidden=true;
      return;
    }
    const meta=metadata(current.work_order_id);
    if(!meta){box.hidden=true;return;}
    box.hidden=false;
    if(details)details.hidden=false;
    delete box.dataset.pendingRestore;
    if(hint)hint.textContent=actionPending?
      "Commande envoyée. Confirmation de Supabase en cours…":
      "Temps confirmé par Supabase environ toutes les 3 s; affichage fluide indicatif.";
    const heartbeatAt=Date.parse(current.last_heartbeat_at||"");
    const stale=current.status==="running"&&Number.isFinite(heartbeatAt)&&
      Date.now()-heartbeatAt>20000;
    box.dataset.status=stale?"paused":current.status;
    status.textContent=actionPending?
      (pendingAction==="pause"?"◌ Pause demandée…":
       pendingAction==="start"?"◌ Reprise demandée…":
       pendingAction==="recover"?"◌ Récupération…":"◌ Ouverture du BT…"):
      stale?"⚠ À récupérer":
      current.status==="running"?"● En cours":"● En pause";
    if(toggle){
      toggle.textContent=actionPending?"⏳ Enregistrement…":
        stale?"⚠ Récupérer":current.status==="running"?"⏸ Pause":"▶ Reprendre";
      toggle.disabled=actionPending;
    }
    if(stop){
      stop.textContent="⏹ Terminer";
      stop.disabled=actionPending;
    }
    number.textContent=meta.number;
    vehicle.textContent=meta.vehicle;
    desc.textContent=meta.description;
    const wrapper=document.getElementById("s06TimerDescription");
    if(wrapper)wrapper.title=meta.description;
    const extra=current.status==="running"&&!stale&&navigator.onLine?
      Math.min(20000,Math.max(0,Date.now()-receivedAt)):0;
    // Quand le BT actif est ouvert, recopier son affichage indicatif.
    // La session doit correspondre : aucune copie depuis un autre BT.
    const pilot=document.getElementById("s06WoPilot");
    const pilotClock=pilot?.querySelector("#s06Clock");
    const activeWo=document.getElementById("woEditId")?.value;
    const sameSession=pilot?.dataset.sessionId===String(current.id)&&
      String(activeWo)===String(current.work_order_id)&&
      document.getElementById("page-workorders")?.style.display!=="none"&&
      document.getElementById("woDetailCard")?.style.display!=="none";
    const pilotMatches=sameSession&&pilotClock&&
      /^\d{2,}:\d{2}:\d{2}$/.test(pilotClock.textContent.trim());
    const pilotSeconds=pilotMatches?
      pilotClock.textContent.trim().split(":").reduce((v,n)=>v*60+Number(n),0):null;
    // Le rafraîchissement réseau (toutes les 8 s) ne doit pas faire reculer
    // l'affichage indicatif pendant une session en marche. Seule la réponse
    // officielle de pause fixe la durée exacte, même si elle diffère.
    const candidateMs=pilotSeconds!==null?pilotSeconds*1000:
      Number(current.confirmed_ms)+extra;
    if(lastRenderedId!==String(current.id)){
      lastRenderedId=String(current.id);
      lastRenderedMs=0;
    }
    const running=current.status==="running"&&!stale&&navigator.onLine;
    const shownMs=actionPending&&pendingAction==="pause"?
      pendingFrozenMs:
      running?Math.max(lastRenderedMs,candidateMs):Number(current.confirmed_ms);
    lastRenderedMs=shownMs;
    time.textContent=formatted(shownMs);
  }
  async function refresh(){
    if(busy)return;
    if(!navigator.onLine){
      if(current){
        receivedAt=Date.now();current={...current,status:"paused"};
        paint();status.textContent="⚠ Hors ligne";
      }else hide();
      return;
    }
    let ready=false;
    try{ready=typeof CLOUD_DATA_READY!=="undefined"&&CLOUD_DATA_READY&&
      typeof ACTIVE_GARAGE_ID==="string"&&!!ACTIVE_GARAGE_ID;}catch(_ignored){}
    if(!ready)return;
    busy=true;
    try{
      const client=window.garageSupabase;
      if(!client?.auth?.getUser||typeof client.from!=="function")return;
      const {data:auth,error:authError}=await client.auth.getUser();
      if(authError||!auth?.user?.id)throw Error("Compte absent");
      if(uid&&uid!==auth.user.id){hide();throw Error("Compte changé");}
      // Écarter toute durée mise en cache par un autre compte/garage.
      if(box.dataset.pendingRestore==="1"){
        try{
          const cached=JSON.parse(sessionStorage.getItem(reconnectKey)||"null");
          if(cached&&(cached.user!==auth.user.id||cached.garage!==ACTIVE_GARAGE_ID))
            hide();
        }catch(_){hide();}
      }
      uid=auth.user.id;garage=ACTIVE_GARAGE_ID;
      const {data,error}=await client.from("garage_timer_sessions")
        .select("id,user_id,garage_id,work_order_id,status,confirmed_ms,last_heartbeat_at,revision,updated_at")
        .eq("user_id",uid).order("updated_at",{ascending:false}).limit(100);
      if(error||!Array.isArray(data)||data.some(r=>r.user_id!==uid))
        throw Error("Lecture Supabase invalide");
      const rows=data.filter(r=>r.garage_id===garage&&
        ["running","paused"].includes(r.status)&&
        Number.isFinite(Number(r.confirmed_ms))&&
        (r.status==="running"||Number(r.confirmed_ms)>0)&&
        !!metadata(r.work_order_id));
      current=rows.find(r=>r.status==="running")||rows[0]||null;
      receivedAt=Date.now();
      if(current)rememberVerified();
      else clearCached();
      paint();
    }catch(_err){
      // Ne pas continuer à afficher comme « en cours » un état cloud invérifiable.
      if(current){
        current={...current,status:"paused"};
        receivedAt=Date.now();paint();
        status.textContent="⚠ À vérifier";
      }else if(box.dataset.pendingRestore==="1"){
        // Aucune réponse serveur : conserver un témoin de reconnexion, jamais
        // le convertir en compteur actif ni activer les boutons.
        if(status)status.textContent="⚠ Connexion non confirmée";
        if(hint)hint.textContent="Dernier temps connu — état Supabase à vérifier.";
      }else hide();
    }finally{busy=false;}
  }
  function triggerPilotAction(action){
    const selected=current&&metadata(current.work_order_id);
    if(!selected||actionPending)return;
    pendingAction=action;
    pendingFrozenMs=lastRenderedMs||Number(current.confirmed_ms);
    actionPending=true;paint();
    // Libérer le verrou après la synchronisation serveur ou, en cas de
    // confirmation annulée, après le délai maximal de l'interface.
    const release=()=>{
      actionPending=false;
      pendingAction=null;
      refresh();
    };
    const timeout=setTimeout(release,10000);
    const handleAck=()=>{clearTimeout(timeout);window.removeEventListener("s06-timer-updated",handleAck);release();};
    window.addEventListener("s06-timer-updated",handleAck,{once:true});
    // Toujours ouvrir le BT. Le pilote revérifie le compte, la session
    // et la révision auprès du serveur avant toute mutation.
    const requestedId=String(current.id);
    if(typeof openWorkOrderFromDashboard==="function")
      openWorkOrderFromDashboard(selected.id);
    let attempts=0;
    const watcher=setInterval(()=>{
      if(++attempts>30){
        clearInterval(watcher);
        clearTimeout(timeout);
        window.removeEventListener("s06-timer-updated",handleAck);
        release();
        return;
      }
      const pilot=document.getElementById("s06WoPilot");
      const currentWo=document.getElementById("woEditId")?.value;
      if(!pilot||String(currentWo)!==selected.id||
        pilot.dataset.sessionId!==requestedId)return;
      const button=pilot.querySelector("#"+(
        action==="finish"?"s06End":
        action==="recover"?"s06Recover":
        action==="pause"?"s06Pause":"s06Start"));
      if(!button||button.disabled||button.hidden){
        if(attempts>=30)clearInterval(watcher);
        return;
      }
      clearInterval(watcher);
      button.click();
    },200);
  }
  toggle?.addEventListener("click",()=>{
    const stamp=Date.parse(current?.last_heartbeat_at||"");
    const stale=current?.status==="running"&&Number.isFinite(stamp)&&
      Date.now()-stamp>20000;
    triggerPilotAction(stale?"recover":current?.status==="running"?"pause":"start");
  });
  stop?.addEventListener("click",()=>triggerPilotAction("finish"));
  number.addEventListener("click",()=>{
    const meta=current&&metadata(current.work_order_id);
    if(!meta)return;
    if(typeof openWorkOrderFromDashboard==="function")
      openWorkOrderFromDashboard(meta.id);
  });
  // À chaque confirmation de transition, actualiser sans attendre le prochain cycle.
  window.addEventListener("s06-timer-updated",refresh);
  setInterval(paint,250);
  setInterval(refresh,8000);
  // Ne pas attendre le prochain cycle de 8 s lorsque l'application finit
  // de charger les données du garage après connexion.
  const boot=setInterval(()=>{
    let ready=false;
    try{ready=!!CLOUD_DATA_READY&&!!ACTIVE_GARAGE_ID;}catch(_){}
    if(ready){
      clearInterval(boot);
      refresh();
    }
  },300);
  refresh();
})();