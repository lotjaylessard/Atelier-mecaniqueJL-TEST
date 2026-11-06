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
  if(!box||!status||!number||!vehicle||!desc||!time)return;
  if(hint)hint.textContent="Temps confirmé par Supabase toutes les 10 s; affichage fluide indicatif.";
  const pad=n=>String(n).padStart(2,"0");
  const formatted=ms=>{
    const total=Math.floor(Math.max(0,Number(ms)||0)/1000);
    return pad(Math.floor(total/3600))+":"+pad(Math.floor(total/60)%60)+":"+pad(total%60);
  };
  let current=null,receivedAt=0,busy=false,uid=null,garage=null;
  const hide=()=>{current=null;box.hidden=true;};
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
    if(!current){box.hidden=true;return;}
    const meta=metadata(current.work_order_id);
    if(!meta){box.hidden=true;return;}
    box.hidden=false;
    box.dataset.status=current.status;
    status.textContent=current.status==="running"?"● En cours":"● En pause";
    number.textContent=meta.number;
    vehicle.textContent=meta.vehicle;
    desc.textContent=meta.description;
    const wrapper=document.getElementById("s06TimerDescription");
    if(wrapper)wrapper.title=meta.description;
    const extra=current.status==="running"&&navigator.onLine?
      Math.min(20000,Math.max(0,Date.now()-receivedAt)):0;
    time.textContent=formatted(Number(current.confirmed_ms)+extra);
  }
  async function refresh(){
    if(busy)return;
    if(!navigator.onLine){
      if(current){receivedAt=Date.now();current={...current,status:"paused"};
        status.textContent="⚠ Hors ligne";}
      paint();return;
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
      uid=auth.user.id;garage=ACTIVE_GARAGE_ID;
      const {data,error}=await client.from("garage_timer_sessions")
        .select("id,user_id,garage_id,work_order_id,status,confirmed_ms,revision,updated_at")
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
      paint();
    }catch(_err){
      // Ne pas continuer à afficher comme « en cours » un état cloud invérifiable.
      if(current){
        current={...current,status:"paused"};
        receivedAt=Date.now();paint();
        status.textContent="⚠ À vérifier";
      }else hide();
    }finally{busy=false;}
  }
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
  refresh();
})();