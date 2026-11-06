"use strict";
/* S06-F03b : EXPERIENCE TEST ISOLÉE, jamais active sans ?s06_timer_test=1.
   Ecrit UNIQUEMENT dans garage_timer_sessions après clic explicite.
   Ne touche ni aux BT, ni aux factures, ni aux timers historiques. */
(() => {
  if(new URLSearchParams(location.search).get("s06_timer_test")!=="1") return;
  const panel=document.createElement("aside");
  panel.id="s06LiveTestPanel";
  panel.style.cssText="position:fixed;right:16px;bottom:16px;z-index:99999;width:min(390px,calc(100vw - 32px));max-height:70vh;overflow:auto;padding:13px;border:1px solid #80bbff;border-radius:10px;background:#172638;color:#eaf4ff;box-shadow:0 4px 20px #0009;font:13px system-ui,sans-serif";
  const title=document.createElement("strong");
  title.textContent="S06 — Minuterie persistante TEST";
  const explanation=document.createElement("p");
  explanation.textContent="Mode d'essai volontaire : seule la table de minuterie est modifiée. Aucune main-d'œuvre ni note n'est ajoutée.";
  const warning=document.createElement("p");
  warning.textContent="Fermer l'onglet durant un test actif peut laisser la session en cours. Attendre 60 s et utiliser Récupérer pour la mettre en pause, sans temps non confirmé.";
  warning.style.cssText="font-size:11px;color:#d7e5fa";
  const status=document.createElement("p");
  status.setAttribute("role","status");
  status.textContent="Aucune opération lancée.";
  status.style.whiteSpace="pre-wrap";
  const bt=document.createElement("select");
  bt.setAttribute("aria-label","Bon de travail TEST");
  bt.style.cssText="width:100%;margin:7px 0;padding:8px;background:#102131;color:#fff;border:1px solid #80bbff;border-radius:5px";
  const sessions=document.createElement("select");
  sessions.setAttribute("aria-label","Session de minuterie TEST");
  sessions.style.cssText=bt.style.cssText;
  const controls=document.createElement("div");
  controls.style.cssText="display:flex;flex-wrap:wrap;gap:7px;margin:8px 0";
  const buttons={};
  function button(key,caption,fn){
    const b=document.createElement("button");b.type="button";b.textContent=caption;
    b.style.cssText="background:#305d88;border:1px solid #80bbff;color:white;padding:7px;border-radius:5px;cursor:pointer";
    b.addEventListener("click",fn);
    buttons[key]=b;controls.append(b);return b;
  }
  const state={uid:null,client:null,garage:null,rows:[],workorders:[],revision:null,busy:false,timer:null};
  function message(v){if(panel.isConnected)status.textContent=v;}
  function stopBeats(){if(state.timer!==null){clearInterval(state.timer);state.timer=null;}}
  function row(){return state.rows.find(r=>r.id===sessions.value)||null;}
  function choice(select,arr,placeholder,makeLabel){
    const before=select.value;
    select.replaceChildren();
    const empty=document.createElement("option");
    empty.value="";empty.textContent=placeholder;select.append(empty);
    for(const r of arr){
      const op=document.createElement("option");op.value=String(r.id);op.textContent=makeLabel(r);select.append(op);
    }
    if([...select.options].some(o=>o.value===before)) select.value=before;
  }
  function checkVersion(r){
    return r&&typeof r.id==="string"&&r.user_id===state.uid&&
      Number.isSafeInteger(Number(r.revision))&&Number.isSafeInteger(Number(r.confirmed_ms))&&
      ["paused","running","posted"].includes(r.status);
  }
  async function withGuard(fn){
    if(state.busy)return;
    state.busy=true;for(const b of Object.values(buttons))b.disabled=true;
    try{
      await ensureLogin();
      await fn();
    }catch(e){
      stopBeats();
      message("Échec / conflit : "+(e?.message||String(e))+"\nRecharge les sessions avant de recommencer.");
    }finally{state.busy=false;for(const b of Object.values(buttons))b.disabled=false;}
  }
  async function ensureLogin(){
    if(!navigator.onLine)throw Error("Hors ligne : aucune action envoyée.");
    const c=window.garageSupabase;
    if(!c || typeof c.auth?.getUser!=="function" || typeof c.rpc!=="function")
      throw Error("Supabase non prêt.");
    const {data,error}=await c.auth.getUser();
    if(error||!data?.user?.id)throw Error("Connexion utilisateur absente.");
    if(state.uid&&state.uid!==data.user.id)throw Error("Compte connecté modifié. Recharge la page.");
    state.uid=data.user.id;state.client=c;
  }
  async function readRows(){
    const {data,error}=await state.client.from("garage_timer_sessions")
      .select("id,user_id,garage_id,work_order_id,status,confirmed_ms,last_heartbeat_at,revision,updated_at")
      .eq("user_id",state.uid).order("updated_at",{ascending:false}).limit(100);
    if(error)throw Error(error.message);
    if(!Array.isArray(data)||data.some(r=>!checkVersion(r)))throw Error("Sessions cloud non conformes.");
    state.rows=data;
    choice(sessions,data,"Choisir une session",r=>"BT "+r.work_order_id+" | "+r.status+" | "+Math.floor(Number(r.confirmed_ms)/1000)+" s | rév. "+r.revision);
    message(data.length+" session(s) TEST; "+data.filter(r=>r.status==="running").length+" en cours.");
  }
  async function readWorkOrders(){
    const {data:members,error:merr}=await state.client.from("garage_members")
      .select("garage_id").eq("user_id",state.uid);
    if(merr)throw Error(merr.message);
    if(!Array.isArray(members)||members.length!==1||!members[0].garage_id)
      throw Error("Le compte doit être membre d'un seul garage.");
    state.garage=members[0].garage_id;
    const {data:garages,error:gerr}=await state.client.from("garage_data")
      .select("data,garage_id").eq("garage_id",state.garage);
    if(gerr)throw Error(gerr.message);
    if(!Array.isArray(garages)||garages.length!==1||!Array.isArray(garages[0].data?.workorders)||
      !Array.isArray(garages[0].data?.invoices))throw Error("Données du garage invalides.");
    const snap=garages[0].data;
    state.workorders=snap.workorders.filter(w=>
      w&&w.status==="en_cours"&&String(w.id||"").trim()&&
      !snap.invoices.some(i=>i&&String(i.workOrderNumber)===String(w.number)));
    choice(bt,state.workorders,"Choisir un BT ouvert",w=>String(w.number||w.id)+" | "+String(w.description||w.desc||"").slice(0,55));
    message(state.workorders.length+" BT admissible(s). Choisis-en un avant de créer une session.");
  }
  async function transition(action){
    const current=row();
    if(!current||current.status==="posted")throw Error("Choisis une session non transférée.");
    if(current.user_id!==state.uid||current.garage_id!==state.garage)throw Error("Compte/garage différent.");
    if(action==="start"&&current.status!=="paused")throw Error("Mettre en pause avant de reprendre.");
    if((action==="heartbeat"||action==="pause"||action==="recover")&&current.status!=="running")
      throw Error("Aucune session active sélectionnée.");
    const {data,error}=await state.client.rpc("s06_timer_transition",{
      p_id:current.id,p_action:action,p_expected_revision:Number(current.revision),p_work_order_id:null
    });
    if(error)throw Error(error.message);
    if(!checkVersion(data)||data.id!==current.id||Number(data.revision)!==Number(current.revision)+1)
      throw Error("Accusé RPC incohérent : relire le serveur.");
    state.rows=state.rows.map(r=>r.id===data.id?data:r);
    const oldId=sessions.value;
    choice(sessions,state.rows,"Choisir une session",r=>"BT "+r.work_order_id+" | "+r.status+" | "+Math.floor(Number(r.confirmed_ms)/1000)+" s | rév. "+r.revision);
    sessions.value=oldId;
    if(data.status!=="running")stopBeats();
    message("Supabase confirmé : "+data.status+", "+Math.floor(Number(data.confirmed_ms)/1000)+" s, rév. "+data.revision);
    if(action==="start"&&data.status==="running")runBeats();
  }
  function runBeats(){
    stopBeats();
    state.timer=setInterval(()=>{
      if(state.busy||!panel.isConnected||!navigator.onLine)return;
      withGuard(async()=>{
        if(row()?.status==="running")await transition("heartbeat");
      });
    },10000);
  }
  button("load","Charger BT",()=>withGuard(readWorkOrders));
  button("refresh","Lire sessions",()=>withGuard(readRows));
  button("create","Créer en pause",()=>withGuard(async()=>{
    const chosen=state.workorders.find(w=>String(w.id)===bt.value);
    if(!chosen||!state.garage)throw Error("Choisis d'abord un BT admissible.");
    if(state.rows.some(r=>r.status==="running"))throw Error("Une minuterie tourne déjà pour ce compte.");
    if(!confirm("Créer une session S06 TEST en pause pour "+String(chosen.number||chosen.id)+" ? Aucune main-d'œuvre ne sera ajoutée."))return;
    const {data,error}=await state.client.rpc("s06_timer_transition",{
      p_id:null,p_action:"create",p_expected_revision:0,p_work_order_id:String(chosen.id)
    });
    if(error)throw Error(error.message);
    if(!checkVersion(data)||data.status!=="paused"||Number(data.revision)!==0||
      String(data.work_order_id)!==String(chosen.id)||data.garage_id!==state.garage)
      throw Error("Création non confirmée.");
    await readRows();
    sessions.value=data.id;
    message("Session créée en pause (rév. 0). Aucun temps facturé.");
  }));
  button("start","Démarrer / Reprendre",()=>withGuard(async()=>transition("start")));
  button("pause","Pause",()=>withGuard(async()=>transition("pause")));
  button("recover","Récupérer (après 60 s)",()=>withGuard(async()=>transition("recover")));
  const close=button("close","Fermer le panneau",()=>{
    stopBeats();panel.remove();
  });
  // Pas de démarrage automatique, ni aucun appel RPC avant une action humaine.
  panel.append(title,explanation,warning,bt,sessions,controls,status);
  document.body.append(panel);
  window.addEventListener("pagehide",stopBeats,{once:true});
})();