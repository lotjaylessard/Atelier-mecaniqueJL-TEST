"use strict";
/* S06-F06: pilote simple TEST, inactif sauf ?s06_wo_pilot=1.
   Les anciennes commandes sont masquées uniquement dans ce mode.
   Ne modifie jamais les BT en local ; seule RPC serveur ajoute notes + main-d'œuvre. */
(() => {
  if(new URLSearchParams(location.search).get("s06_wo_pilot")!=="1")return;
  document.body.classList.add("s06-wo-pilot");
  const style=document.createElement("style");
  style.textContent=`.s06-wo-pilot #woTimerBtn,.s06-wo-pilot #woTimerPauseBtn,
.s06-wo-pilot #woTimerStopBtn,.s06-wo-pilot #woTimerDisplay{display:none!important}
#s06WoPilot{margin:6px 0;padding:8px 10px;background:#172638;color:#eaf4ff;
border:1px solid #80bbff;border-radius:7px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;align-items:center}
#s06WoPilot .s06head{display:flex;justify-content:flex-start;flex-wrap:wrap;gap:4px 12px;align-items:center;min-width:0;font-size:13px}
#s06WoPilot .s06head span{font-size:11px}
#s06WoPilot .s06clock{font-size:27px;font-weight:750;color:#ffd400;font-variant-numeric:tabular-nums;line-height:1.15;text-align:right;white-space:nowrap}
#s06WoPilot .s06buttons{grid-column:1/-1;display:flex;gap:5px;flex-wrap:wrap;margin:3px 0}
#s06WoPilot button{padding:6px 10px;border-radius:5px;background:#ffd400;color:#151515;border:0;font-weight:700;font-size:12px;cursor:pointer}
#s06WoPilot button:disabled{opacity:.45;cursor:default}
#s06WoPilot .s06secondary{background:#315c85;color:#fff}
#s06WoPilot .s06message{grid-column:1/-1;white-space:pre-wrap;font-size:11px;line-height:1.3;color:#c9daed;margin:2px 0 0}
#s06WoPilot .s06saved{grid-column:1/-1;font-size:11px;line-height:1.2;margin:1px 0;color:#9ac5ef}
#s06WoPilot .s06saved[data-state="confirmed"]{color:#83d6aa}
#s06WoPilot .s06saved[data-state="warning"]{color:#ffc28b}
#s06WoPilot .s06gap{grid-column:1/-1;padding:8px;border:1px solid #ffc28b;background:#352817;border-radius:5px;color:#ffe0ad;font-size:12px;line-height:1.4}
#s06WoPilot .s06gap[hidden]{display:none}
#s06WoPilot label{display:block;margin:6px 0 3px;font-weight:600}
#s06WoPilot input,#s06WoPilot textarea{box-sizing:border-box;width:100%;padding:7px;background:#101e2e;color:white;border:1px solid #80bbff;border-radius:5px}
#s06WoPilot textarea{min-height:70px}
#s06WoPilot .s06finish{grid-column:1/-1;padding-top:8px;border-top:1px solid #617e9d}
/* S06-F10 : panneau technique conservé dans le DOM, discret hors confirmation.
   Les écritures restent exclusivement sur le pilote Supabase validé. */
#s06WoPilot{display:none}
#s06WoPilot.s06-await-start{display:block;margin:6px 0;padding:0;border:0;background:transparent;color:inherit}
#s06WoPilot.s06-await-start .s06head,
#s06WoPilot.s06-await-start .s06clock,
#s06WoPilot.s06-await-start .s06saved,
#s06WoPilot.s06-await-start .s06message,
#s06WoPilot.s06-await-start .s06gap,
#s06WoPilot.s06-await-start #s06Pause,
#s06WoPilot.s06-await-start #s06End,
#s06WoPilot.s06-await-start #s06Recover{display:none!important}
#s06WoPilot.s06-await-start .s06buttons{display:flex;margin:0}
#s06WoPilot.s06-await-start #s06Start{border:1px solid #c9a300;background:transparent;color:#ffd400}
#s06WoPilot.s06-await-start #s06Start::after{content:" minuterie"}
#s06WoPilot.s06-confirming{display:grid;margin:8px 0;border-color:#d6af29;background:#262626;color:#eee}
#s06WoPilot.s06-confirming .s06head,
#s06WoPilot.s06-confirming .s06clock,
#s06WoPilot.s06-confirming .s06buttons{display:none}
#s06WoPilot.s06-confirming .s06finish{display:block}
#s06WoPilot.s06-confirming .s06saved{display:block}
#s06WoPilot.s06-confirming .s06message{display:block}
#s06WoPilot.s06-interrupted{display:grid;background:#292622;border-color:#c49d54}
#s06WoPilot.s06-interrupted .s06buttons{display:flex}
#s06WoPilot.s06-interrupted .s06buttons #s06Start,
#s06WoPilot.s06-interrupted .s06buttons #s06Pause,
#s06WoPilot.s06-interrupted .s06buttons #s06End{display:none}
#s06WoPilot.s06-interrupted .s06gap:not([hidden]){display:block}
#s06WoPilot.s06-interrupted .s06message{display:block}
#s06WoPilot.s06-interrupted .s06saved{display:block}

@media(max-width:560px){#s06WoPilot{grid-template-columns:1fr}#s06WoPilot .s06clock{grid-column:1;text-align:left}}`;
  document.head.append(style);
  const app={user:null,garage:null,woId:null,session:null,rows:[],panel:null,busy:false,beat:null,displayTick:null,displayAnchor:null,ownRunning:null,lastVerified:null};
  // S06 : après un POST validé, conserver le rechargement de sécurité
  // et rouvrir uniquement le BT du même garage et du même compte.
  const restoreKey="s06-posted-return-v1";
  const ownerKey="s06-tab-owner-v1";
  // Uniquement la dernière session réellement démarrée dans CET onglet.
  // sessionStorage survit au refresh, mais pas à un autre appareil.
  function rememberOwner(){
    if(!app.session||!app.user||!app.garage||!app.woId)return;
    try{sessionStorage.setItem(ownerKey,JSON.stringify({
      user:app.user,garage:app.garage,id:app.session.id,woId:app.woId,
      at:Date.now()
    }));}catch(_){}
  }
  function clearOwner(){
    try{sessionStorage.removeItem(ownerKey);}catch(_){}
  }
  function ownerSnapshot(){
    try{
      const o=JSON.parse(sessionStorage.getItem(ownerKey)||"null");
      if(!o||!o.id||!o.woId||!o.user||!o.garage||
         !Number.isFinite(Number(o.at))||Date.now()-Number(o.at)>86400000)return null;
      return o;
    }catch(_){return null;}
  }

  function restoreAfterReload(){
    let saved;
    try{saved=JSON.parse(sessionStorage.getItem(restoreKey)||"null");}catch(_){return;}
    if(!saved||!saved.woId||!saved.garage||!saved.user)return;
    if(Date.now()-Number(saved.at)>120000){
      try{sessionStorage.removeItem(restoreKey);}catch(_){}
      return;
    }
    const started=Date.now();
    const check=setInterval(()=>{
      if(Date.now()-started>20000){clearInterval(check);return;}
      try{
        if(typeof CLOUD_DATA_READY==="undefined"||!CLOUD_DATA_READY||
           typeof WORKORDERS==="undefined"||typeof ACTIVE_GARAGE_ID==="undefined"||
           typeof SUPABASE_USER==="undefined"||!SUPABASE_USER?.id)return;
        if(String(ACTIVE_GARAGE_ID)!==saved.garage||
           String(SUPABASE_USER.id)!==saved.user){
          clearInterval(check);sessionStorage.removeItem(restoreKey);return;
        }
        const wo=WORKORDERS.find(w=>String(w?.id)===saved.woId);
        if(!wo){clearInterval(check);sessionStorage.removeItem(restoreKey);return;}
        if(typeof showPage!=="function")return;
        // Passer par l'ouverture normale du tableau (interface S04 actuelle),
        // pas l'ancien openWorkOrderDetail qui affiche d'autres boutons.
        showPage("page-workorders");
        const row=Array.from(document.querySelectorAll("#woTable tr[data-id]"))
          .find(tr=>tr.dataset.id===saved.woId);
        const openButton=row?.querySelector('button[data-action="open"]');
        if(!openButton){clearInterval(check);return;}
        clearInterval(check);
        sessionStorage.removeItem(restoreKey);
        openButton.click();
      }catch(_){clearInterval(check);}
    },250);
  }
  restoreAfterReload();
  const qs=id=>app.panel?.querySelector("#"+id);
  const format=ms=>{const n=Math.floor(Math.max(0,Number(ms)||0)/1000);
    return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,"0")).join(":");};
  const money=n=>new Intl.NumberFormat("fr-CA",{style:"currency",currency:"CAD"}).format(n);
  const setMsg=s=>{if(qs("s06Msg"))qs("s06Msg").textContent=s;};
  // Le compteur est animé localement; le libellé de sauvegarde cite UNIQUEMENT le temps serveur.
  function savedStatus(kind,detail=""){
    const el=qs("s06SavedStatus");
    if(!el)return;
    el.dataset.state=kind;
    el.textContent=detail;
  }
  function confirmSaved(row,source){
    if(!validRow(row))throw Error("Impossible de confirmer le temps distant.");
    app.lastVerified={id:row.id,revision:Number(row.revision),ms:Number(row.confirmed_ms)};
    const clock=new Intl.DateTimeFormat("fr-CA",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"America/Toronto"}).format(new Date());
    savedStatus("confirmed","✓ Enregistré dans Supabase à "+clock+
      " · "+format(row.confirmed_ms)+" confirmé"+(source==="read"?" (relecture)":""));
  }
  function stopBeat(){
    if(app.beat!==null){clearInterval(app.beat);app.beat=null;}
    if(app.displayTick!==null){clearInterval(app.displayTick);app.displayTick=null;}
    app.displayAnchor=null;app.ownRunning=null;
    paint();
  }
  function liveTime(){
    const r=app.session;
    if(!r)return 0;
    // Maximum de 20 secondes affichées sans accusé serveur; ne jamais les
    // présenter comme du temps sauvegardé ni les conserver après une erreur.
    if(r.status!=="running"||app.ownRunning!==r.id||!app.displayAnchor||
       !navigator.onLine)return Number(r.confirmed_ms)||0;
    const elapsed=Math.max(0,Date.now()-app.displayAnchor.at);
    return app.displayAnchor.ms+Math.min(20000,elapsed);
  }
  function startDisplay(){
    if(app.displayTick!==null)clearInterval(app.displayTick);
    if(app.session?.status!=="running"||app.ownRunning!==app.session.id)return;
    app.displayAnchor={at:Date.now(),ms:Number(app.session.confirmed_ms)};
    app.displayTick=setInterval(paint,250);
    paint();
  }
  // S06-F09 TEST : période POSSIBLEMENT non confirmée. Ce n'est ni du
  // temps sauvegardé, ni un crédit à facturer. Les horloges des appareils
  // peuvent différer; seules les opérations RPC changent confirmed_ms.
  function pendingGap(row){
    if(!row||row.status!=="running"||!row.last_heartbeat_at)return null;
    const stamp=Date.parse(row.last_heartbeat_at);
    if(!Number.isFinite(stamp))return null;
    const gap=Math.max(0,Date.now()-stamp);
    return gap>20000?gap:null;
  }
  function paintPendingGap(){
    const el=qs("s06UnverifiedGap");
    if(!el)return;
    const gap=pendingGap(app.session);
    el.hidden=gap===null;
    if(gap===null)return;
    el.textContent="⚠ Interruption possible : environ "+format(gap)+
      " depuis la dernière confirmation Supabase. Cette période n'est PAS enregistrée. "+
      "Ne ferme pas le BT ni ne facture ce temps sans le vérifier. "+
      "Après au moins 60 s sans confirmation, utilise « Récupérer » pour figer la session en pause.";
  }
  function validRow(r){return r&&r.user_id===app.user&&r.garage_id===app.garage&&
    typeof r.id==="string"&&Number.isSafeInteger(Number(r.revision))&&
    Number.isSafeInteger(Number(r.confirmed_ms))&&
    ["paused","running","posted"].includes(r.status);}
  function context(){
    const page=document.getElementById("page-workorders");
    const detail=document.getElementById("woDetailCard");
    const anchor=document.getElementById("woTimerDisplay");
    const id=document.getElementById("woEditId")?.value;
    if(!page||page.style.display==="none"||!detail||detail.style.display==="none"||!anchor||!id)return null;
    const wo=typeof WORKORDERS!=="undefined"&&Array.isArray(WORKORDERS)
      ?WORKORDERS.find(x=>x&&String(x.id)===String(id)):null;
    if(!wo||wo.status!=="en_cours"||typeof INVOICES!=="undefined"&&
      Array.isArray(INVOICES)&&INVOICES.some(x=>x&&String(x.workOrderNumber)===String(wo.number)))return null;
    return {id:String(id),anchor};
  }
  function paint(){
    if(!app.panel)return;
    const r=app.session;
    const isInterrupted=r?.status==="running"&&
      (!!interruptedReason||pendingGap(r)!==null)&&app.ownRunning!==r.id;
    app.panel.classList.toggle("s06-await-start",
      (!r||(r.status==="paused"&&Number(r.confirmed_ms)===0))&&!app.busy);
    app.panel.classList.toggle("s06-interrupted",!!isInterrupted&&!app.panel.classList.contains("s06-confirming"));
    // Identité de session visible pour le miroir lecture seule du menu.
    // Une session différente ne doit jamais être affichée comme synchronisée.
    if(r?.id)app.panel.dataset.sessionId=String(r.id);
    else delete app.panel.dataset.sessionId;
    qs("s06Clock").textContent=format(liveTime());
    const stale=r?.status==="running"&&(
      !!interruptedReason||pendingGap(r)!==null);
    qs("s06State").textContent=stale?"⚠ Interrompu — à vérifier":
      r?.status==="running"?"● En cours":r?.status==="paused"?"● En pause":"● Prête";
    const another=app.rows.some(x=>x.status==="running"&&x.work_order_id!==app.woId);
    qs("s06Start").disabled=app.busy||!!another||r?.status==="running"||r?.status==="posted";
    qs("s06Pause").disabled=app.busy||r?.status!=="running"||app.ownRunning!==r.id;
    qs("s06End").disabled=app.busy||!!another||!r||r.status!=="paused"||
      Number(r.confirmed_ms)<18000;
    qs("s06Recover").hidden=!(r?.status==="running"&&app.ownRunning!==r.id);
    qs("s06Recover").disabled=app.busy;
    if(another)setMsg("Une autre minuterie est en cours. Ouvre son BT pour la gérer.");
    paintPendingGap();
  }
  async function client(){
    if(!navigator.onLine)throw Error("Connexion Internet requise.");
    const c=window.garageSupabase;
    if(!c?.auth?.getUser||!c?.rpc)throw Error("Supabase n'est pas prêt.");
    const {data,error}=await c.auth.getUser();
    if(error||!data?.user?.id)throw Error("Compte non confirmé.");
    if(app.user&&app.user!==data.user.id)throw Error("Le compte a changé. Recharge la page.");
    app.user=data.user.id;
    if(typeof CLOUD_DATA_READY==="undefined"||!CLOUD_DATA_READY||
       typeof ACTIVE_GARAGE_ID!=="string"||!ACTIVE_GARAGE_ID)
      throw Error("Garage non chargé.");
    app.garage=ACTIVE_GARAGE_ID;
    return c;
  }
  async function read(){
    const c=await client();
    const {data,error}=await c.from("garage_timer_sessions")
      .select("id,user_id,garage_id,work_order_id,status,confirmed_ms,last_heartbeat_at,revision,posted_labor_id")
      .eq("user_id",app.user).order("updated_at",{ascending:false}).limit(100);
    if(error)throw Error(error.message);
    if(!Array.isArray(data)||data.some(x=>!validRow(x)))throw Error("Sessions cloud invalides.");
    app.rows=data;
    const mine=data.filter(x=>x.work_order_id===app.woId&&x.status!=="posted");
    app.session=mine.find(x=>x.status==="running")||mine[0]||null;
    paint();
    if(app.session)confirmSaved(app.session,"read");
    else {app.lastVerified=null;savedStatus("idle","Aucune session enregistrée pour ce BT.");}
  }
  async function rpc(action,existing,woId=null){
    // Heartbeat fréquent : éviter un getUser réseau supplémentaire à chaque ping.
    // La RPC Supabase contrôle toujours auth.uid() et la révision côté serveur.
    const c=action==="heartbeat"&&app.user&&app.garage&&navigator.onLine&&
      window.garageSupabase?.rpc?window.garageSupabase:await client();
    const {data,error}=await c.rpc("s06_timer_transition",{
      p_id:existing?.id||null,p_action:action,
      p_expected_revision:existing?Number(existing.revision):0,p_work_order_id:woId
    });
    if(error)throw Error(error.message||"Écriture Supabase non confirmée.");
    if(!validRow(data)||existing&&(data.id!==existing.id||
      Number(data.revision)!==Number(existing.revision)+1)||
      !existing&&(data.work_order_id!==woId||data.status!=="paused"||Number(data.revision)!==0))
      throw Error("Accusé de réception serveur incohérent. Recharge la page.");
    app.rows=app.rows.filter(x=>x.id!==data.id).concat(data);
    if(data.work_order_id===app.woId)app.session=data;
    if(action==="heartbeat"&&app.ownRunning===data.id){
      if(data.status==="running"){
        app.displayAnchor={at:Date.now(),ms:Number(data.confirmed_ms)};
      }else{
        // Le serveur a arrêté les confirmations : ne plus afficher un timer actif.
        clearOwner();
        stopBeat();
        interruptedReason="Le serveur a mis la minuterie en pause après une interruption de confirmation.";
        setMsg("⚠ Minuterie suspendue par Supabase. Vérifie le temps confirmé avant de reprendre.");
      }
    }
    paint();confirmSaved(data,"write");
    window.dispatchEvent(new Event("s06-timer-updated"));
    window.dispatchEvent(new CustomEvent("s06-timer-ack",{detail:{
      action,sessionId:data.id,revision:Number(data.revision),status:data.status
    }}));
    return data;
  }
  // Pilot S06 : detection d'une veille du navigateur. Ne jamais envoyer
  // automatiquement un heartbeat retardé ni prétendre avoir confirmé ce temps.
  let lastWakeCheck=0;
  let interruptedReason="";
  let heartbeatFailures=0;
  function warnInterrupted(reason){
    interruptedReason=reason;
    clearOwner();
    stopBeat();
    savedStatus("warning","⚠ "+reason+" — période non confirmée, non facturée.");
    setMsg("Le serveur doit être relu. Après 60 s sans confirmation, utilise Récupérer, puis Reprendre. Le temps interrompu exige une validation distincte.");
  }
  async function recheckInterrupted(){
    await read();
    if(interruptedReason){
      savedStatus("warning","⚠ "+interruptedReason+" — période non confirmée, non facturée.");
      setMsg("État relu dans Supabase. Ne reprends pas sans vérifier la période interrompue; le temps non confirmé n'est pas encore récupérable automatiquement.");
    }
  }
  function beats(){
    stopBeat();
    if(app.session?.status!=="running")return;
    app.ownRunning=app.session.id;
    heartbeatFailures=0;
    rememberOwner();
    startDisplay();
    lastWakeCheck=Date.now();
    app.beat=setInterval(()=>{
      if(app.busy)return;
      const now=Date.now(),gap=now-lastWakeCheck;
      lastWakeCheck=now;
      if(gap>45000){
        warnInterrupted("Veille ou interruption détectée ("+Math.round(gap/1000)+" s)");
        guarded(recheckInterrupted);
        return;
      }
      if(!navigator.onLine){
        warnInterrupted("Connexion perdue");
        return;
      }
      guarded(async()=>{
        if(app.session?.status==="running"&&app.ownRunning===app.session.id){
          await rpc("heartbeat",app.session);setMsg("Minuterie en cours.");
        }
      },true);
    },5000);
  }
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState!=="visible"||!app.session)return;
    if(app.ownRunning===app.session.id&&lastWakeCheck&&Date.now()-lastWakeCheck>45000){
      warnInterrupted("Retour après mise en veille");
      guarded(recheckInterrupted);
    }else if(!app.ownRunning){
      guarded(read);
    }
  });
  window.addEventListener("online",()=>{
    if(app.session && !app.ownRunning)guarded(read);
  });
  async function guarded(fn,isHeartbeat=false){
    if(app.busy)return;
    app.busy=true;paint();
    try{
      await fn();
      if(isHeartbeat)heartbeatFailures=0;
    }catch(e){
      if(isHeartbeat && app.session?.status==="running"&&app.ownRunning===app.session.id){
        // Une réponse RPC perdue peut avoir été enregistrée côté serveur.
        // Relire la révision avant de réessayer pour éviter les doublons.
        heartbeatFailures++;
        try{
          await read();
          const age=Date.now()-Date.parse(app.session?.last_heartbeat_at||"");
          if(app.session?.status==="running"&&
             Number.isFinite(age)&&age>=0&&age<45000){
            app.displayAnchor={at:Date.now(),ms:Number(app.session.confirmed_ms)};
            heartbeatFailures=0;
            setMsg("Confirmation retrouvée après une réponse réseau manquante.");
            return;
          }
        }catch(_){}
        if(heartbeatFailures<3&&navigator.onLine){
          savedStatus("warning","⚠ Confirmation réseau retardée. Nouvelle tentative automatique.");
          return;
        }
      }
      warnInterrupted("Connexion ou confirmation Supabase interrompue");
      app.panel?.classList.add("s06-interrupted");
      setMsg("Action non confirmée : "+(e?.message||e)+
        "\nLe temps manquant n'a pas été ajouté. Vérifie la session puis récupère-la.");
    }finally{app.busy=false;paint();}
  }
  async function start(){
    interruptedReason="";
    await read();
    if(app.rows.some(x=>x.status==="running"))throw Error("Une minuterie est déjà en cours; récupère-la après 60 s si elle a été interrompue.");
    if(!app.session){
      if(!confirm("Démarrer une minuterie TEST pour ce BT ? Aucune ligne de main-d'œuvre ajoutée avant confirmation."))return;
      app.session=await rpc("create",null,app.woId);
    }
    const res=await rpc("start",app.session);
    beats();setMsg("Démarrée. Temps confirmé par Supabase environ toutes les 5 secondes.");
  }
  async function pause(){
    if(!app.session||app.session.status!=="running"||app.ownRunning!==app.session.id)
      throw Error("Cette minuterie n'a pas été démarrée dans cet onglet.");
    const res=await rpc("pause",app.session);
    if(res.status!=="paused")throw Error("Pause non confirmée.");
    clearOwner();stopBeat();setMsg("Pause confirmée. Durée conservée sur Supabase.");
  }
  async function recover(){
    await read(); // Etat et révision relus avant tout changement.
    const session=app.session;
    if(!session||session.status!=="running")throw Error("Aucune minuterie à récupérer.");
    const stamp=Date.parse(session.last_heartbeat_at||"");
    if(!Number.isFinite(stamp))throw Error("Dernière confirmation inconnue.");
    const availableSeconds=Math.floor((Date.now()-stamp)/1000);
    if(availableSeconds<60)throw Error("Attends 60 secondes après la dernière confirmation serveur.");
    const raw=prompt(
      "Période interrompue : environ "+format(availableSeconds*1000)+
      ".\nCombien de MINUTES as-tu réellement travaillées pendant cette période ?"+
      "\nEntre 0 pour récupérer sans ajouter de temps. Annuler ne change rien.","0");
    if(raw===null)return;
    const str=raw.trim().replace(",",".");
    if(!/^(?:\d+)(?:\.\d{1,2})?$/.test(str))
      throw Error("Entre un nombre de minutes valide (ex. 1,5).");
    const seconds=Math.round(Number(str)*60);
    if(!Number.isSafeInteger(seconds)||seconds<0||seconds>28800||
       seconds>availableSeconds)
      throw Error("La durée doit être positive et ne pas dépasser l'interruption ni 8 heures.");
    if(!confirm(seconds>0?
      "Confirmer l'ajout MANUEL de "+format(seconds*1000)+
      " à la session du BT ? Cette opération est définitive et tracée sur Supabase.":
      "Récupérer en pause SANS ajouter les minutes interrompues ?"))return;
    let res;
    if(seconds===0){
      res=await rpc("recover",session);
    }else{
      const c=await client();
      const {data,error}=await c.rpc("s06_timer_recover_with_adjustment",{
        p_session_id:session.id,p_expected_revision:Number(session.revision),
        p_extra_seconds:seconds
      });
      if(error)throw Error(error.message||"Récupération serveur non confirmée.");
      if(!validRow(data)||data.id!==session.id||data.status!=="paused"||
         Number(data.revision)!==Number(session.revision)+1||
         Number(data.confirmed_ms)!==Number(session.confirmed_ms)+seconds*1000)
        throw Error("Confirmation ambiguë : recharge puis relis la session, ne répète pas l'ajout.");
      res=data;
      app.rows=app.rows.filter(x=>x.id!==res.id).concat(res);
      app.session=res;
      confirmSaved(res,"write");
      window.dispatchEvent(new Event("s06-timer-updated"));
      window.dispatchEvent(new CustomEvent("s06-timer-ack",{detail:{
        action:"recover",sessionId:res.id,revision:Number(res.revision),status:res.status
      }}));
    }
    if(res.status!=="paused")throw Error("La session n'est pas en pause.");
    interruptedReason="";
    clearOwner();
    stopBeat();paint();
    await read();
    setMsg(seconds>0?
      "✓ Session récupérée. "+format(seconds*1000)+
      " ajoutées manuellement et enregistrées dans Supabase. Aucun BT facturé avant « Terminer ».":
      "Session récupérée en pause, sans ajouter le temps interrompu.");
  }
  function safeToPost(){
    try{return CLOUD_DATA_READY&&!CLOUD_SYNC_FAILED&&!CLOUD_SYNC_IN_PROGRESS&&
      !CLOUD_SYNC_PENDING&&!CLOUD_SYNC_DIRTY&&cloudSyncTimer===null&&
      Number.isSafeInteger(CLOUD_DATA_VERSION)&&CLOUD_LAST_CONFIRMED_SNAPSHOT&&
      garageSnapshotsEquivalent(captureLocalGarageSnapshot(),CLOUD_LAST_CONFIRMED_SNAPSHOT);
    }catch(_){return false;}
  }
  function quote(){
    if(!app.panel||!app.session)return;
    const raw=qs("s06Rate").value,rate=Number(raw);
    const confirmedMs=Number(app.session.confirmed_ms);
    const hrs=confirmedMs/3600000;
    // Calcul en cents a partir des millisecondes exactes.
    // BigInt evite de perdre un demi-cent lors des arrondissements successifs.
    const cents=raw!==""&&Number.isFinite(rate)&&rate>=0&&rate<=100000?
      (BigInt(Math.round(confirmedMs))*BigInt(Math.round(rate*100))+1800000n)/3600000n:null;
    qs("s06Quote").textContent=cents!==null?
      format(confirmedMs)+" = "+hrs.toFixed(2)+" h affichées (durée exacte facturée) × "+
      money(rate)+"/h = "+money(Number(cents)/100):
      "Taux horaire invalide";
  }
  function showFinish(){
    if(!app.session||app.session.status!=="paused")throw Error("Mets la minuterie en pause avant de terminer.");
    app.panel?.classList.add("s06-confirming");
    const d=qs("s06FinishForm");d.hidden=false;
    qs("s06Description").value="";
    qs("s06Rate").value=String(Number(typeof SETTINGS!=="undefined"&&(SETTINGS.defaultHourlyRate||SETTINGS.defaultLaborRate)||90));
    quote();
  }
  async function finish(){
    const session=app.session,raw=qs("s06Rate").value,rate=Number(raw),
      desc=qs("s06Description").value.trim();
    if(!session||session.status!=="paused"||Number(session.confirmed_ms)<18000)
      throw Error("Il faut une minuterie en pause d'au moins 18 secondes.");
    if(!desc||desc.length>2000||raw===""||!Number.isFinite(rate)||rate<0||rate>100000)
      throw Error("Description et taux horaire valides requis.");
    if(!safeToPost())throw Error("Une sauvegarde locale est en cours ou en conflit.");
    const c=await client();
    const {data:latest,error:readError}=await c.from("garage_data")
      .select("version").eq("garage_id",app.garage).single();
    if(readError||!latest||Number(latest.version)!==CLOUD_DATA_VERSION)
      throw Error("Le BT a changé sur un autre appareil. Recharge la page.");
    if(!confirm("Ajouter définitivement la main-d'œuvre et la note au BT TEST ?"))return;
    // Dès que la RPC part, empêcher l'autosave de réécrire un snapshot ancien.
    CLOUD_DATA_READY=false;
    const {data:ack,error}=await c.rpc("s06_timer_post_labor",{
      p_session_id:session.id,p_expected_revision:Number(session.revision),
      p_expected_garage_version:Number(latest.version),p_description:desc,p_hourly_rate:rate
    });
    if(error)throw Error(error.message+" — recharge avant toute nouvelle confirmation.");
    if(!ack||ack.session_id!==session.id||ack.work_order_id!==app.woId||
      Number(ack.garage_version)!==Number(latest.version)+1)
      throw Error("Confirmation serveur ambiguë. Recharge avant de réessayer.");
    const [{data:remoteS,error:se},{data:remoteG,error:ge}]=await Promise.all([
      c.from("garage_timer_sessions").select("id,status,posted_labor_id,revision,user_id")
       .eq("id",session.id).single(),
      c.from("garage_data").select("data,version").eq("garage_id",app.garage).single()
    ]);
    const wo=remoteG?.data?.workorders?.find(w=>String(w.id)===app.woId);
    const lines=wo?.labor?.filter(l=>l?.timerSessionId===session.id)||[];
    const marker="[S06 minuterie : "+session.id+"]";
    if(se||ge||!remoteS||!remoteG||remoteS.status!=="posted"||
      remoteS.posted_labor_id!==session.id||remoteS.user_id!==app.user||
      Number(remoteG.version)!==Number(ack.garage_version)||lines.length!==1||
      typeof wo.notes!=="string"||wo.notes.split(marker).length!==2||
      Number(lines[0].total)!==Number(ack.total))
      throw Error("Écriture probablement effectuée, mais lecture incohérente. Recharge le BT; ne répète pas la confirmation.");
    clearOwner();
    stopBeat();
    window.dispatchEvent(new Event("s06-timer-updated"));
    qs("s06FinishForm").hidden=true;
    setMsg("✅ Intervention enregistrée : "+money(Number(ack.total))+
      ".\nNote technique ajoutée au BT. Employé et date conservés.\nRechargement du BT...");
    // Relecture complète pour remplacer le vieux snapshot local, jamais d'autosave avec la version précédente.
    // Marqueur d'interface seulement : ne contient aucune donnée client ni montant.
    try{sessionStorage.setItem(restoreKey,JSON.stringify({
      woId:String(app.woId),garage:String(app.garage),user:String(app.user),at:Date.now()
    }));}catch(_){}
    location.reload();
  }
  function mount(){
    const ctx=context();
    // Navigation dans le garage : ne JAMAIS interrompre les confirmations
    // serveur d'une minuterie active simplement parce que le BT est masqué.
    if(!ctx){if(app.panel){app.panel.remove();app.panel=null;}return;}
    if(app.panel?.isConnected&&app.woId===ctx.id)return;
    if(app.panel){app.panel.remove();app.panel=null;}
    if(app.woId!==ctx.id){
      // Tant qu'un autre BT tourne, le pilote garde cette session intacte;
      // on peut y retourner via son numéro dans le menu latéral.
      if(app.session?.status==="running"&&app.ownRunning===app.session.id)return;
      stopBeat();app.session=null;app.rows=[];app.lastVerified=null;app.woId=ctx.id;
    }
    const el=document.createElement("section");el.id="s06WoPilot";
    el.innerHTML=`<div class="s06head"><strong>⏱ Minuterie du BT — TEST</strong><span id="s06State">● Prête</span></div>
      <div id="s06Clock" class="s06clock">00:00:00</div>
      <div class="s06buttons"><button type="button" id="s06Start">▶ Démarrer / Reprendre</button>
      <button type="button" class="s06secondary" id="s06Pause">⏸ Pause</button>
      <button type="button" class="s06secondary" id="s06End">✓ Terminer</button>
      <button type="button" class="s06secondary" id="s06Recover" hidden>Récupérer après 60 s</button></div>
      <div class="s06finish" id="s06FinishForm" hidden>
      <label for="s06Description">Description du travail effectué *</label>
      <textarea id="s06Description" maxlength="2000"></textarea>
      <label for="s06Rate">Taux horaire ($/h)</label><input id="s06Rate" type="number" min="0" max="100000" step="0.01">
      <p id="s06Quote"></p><button type="button" id="s06Confirm">Confirmer l'ajout au BT</button>
      <button type="button" class="s06secondary" id="s06Cancel">Annuler</button></div>
      <div id="s06UnverifiedGap" class="s06gap" role="status" aria-live="polite" hidden></div>
      <p id="s06SavedStatus" class="s06saved" data-state="idle" role="status" aria-live="polite">Vérification Supabase en attente…</p>
      <p id="s06Msg" class="s06message">Chargement de la session Supabase…</p>`;
    ctx.anchor.parentElement.parentElement.insertAdjacentElement("afterend",el);
    app.panel=el;
    qs("s06Start").addEventListener("click",()=>guarded(start));
    qs("s06Pause").addEventListener("click",()=>guarded(pause));
    qs("s06Recover").addEventListener("click",()=>guarded(recover));
    qs("s06End").addEventListener("click",()=>guarded(showFinish));
    qs("s06Confirm").addEventListener("click",()=>guarded(finish));
    qs("s06Cancel").addEventListener("click",()=>{
      qs("s06FinishForm").hidden=true;
      app.panel?.classList.remove("s06-confirming");
      paint();
    });
    qs("s06Rate").addEventListener("input",quote);
    paint();
    guarded(async()=>{await read();setMsg(app.session?
      "Session retrouvée automatiquement dans Supabase.":
      "Aucune session : appuie sur Démarrer pour commencer.");});
  }
  // Reprise automatique après F5 / Ctrl+Shift+R :
  // pas de remise à zéro de la session, pas de double minuteur.
  // Un heartbeat court et atomique ré-attache la session de CET onglet.
  async function rejoinAfterReload(){
    const stored=ownerSnapshot();
    if(!stored)return;
    let elapsed=0;
    const check=setInterval(async()=>{
      elapsed+=250;
      if(elapsed>30000){clearInterval(check);return;}
      try{
        if(typeof CLOUD_DATA_READY==="undefined"||!CLOUD_DATA_READY||
           typeof ACTIVE_GARAGE_ID!=="string"||!ACTIVE_GARAGE_ID||
           !window.garageSupabase?.auth?.getUser)return;
        // Le BT peut être en cours de chargement lors du refresh.
        // Ne pas abandonner la reprise si une lecture du formulaire est déjà active.
        if(app.ownRunning){clearInterval(check);return;}
        if(app.busy)return;
        clearInterval(check);
        const c=await client(); // auth.uid + garage courants
        if(stored.user!==app.user||stored.garage!==app.garage){clearOwner();return;}
        const {data,error}=await c.from("garage_timer_sessions")
          .select("id,user_id,garage_id,work_order_id,status,confirmed_ms,last_heartbeat_at,revision,posted_labor_id")
          .eq("id",stored.id).eq("user_id",app.user).single();
        if(error||!validRow(data)||data.work_order_id!==stored.woId||
           data.status!=="running"){clearOwner();return;}
        const gap=Date.now()-Date.parse(data.last_heartbeat_at||"");
        if(!Number.isFinite(gap)||gap<0||gap>45000){
          // Retour trop tardif : la période est incertaine, récupération manuelle.
          clearOwner();return;
        }
        app.woId=stored.woId;
        app.session=data;
        app.rows=[data];
        // Le serveur accepte au plus 60 secondes depuis le dernier heartbeat.
        const ack=await rpc("heartbeat",data);
        if(ack.status==="running"){
          beats();
          setMsg("Session retrouvée et confirmée par Supabase après rafraîchissement.");
        }else{
          clearOwner();
        }
      }catch(e){
        clearOwner();
        stopBeat();
        console.warn("[S06 TEST] Reprise automatique non confirmée",e?.message||e);
      }
    },250);
  }
  rejoinAfterReload();
  // Le BT est rendu dynamiquement ; une vérification légère suffit.
  // Pas de changement de données ni d'appel réseau hors du BT.
  const watcher=setInterval(mount,900);
  window.addEventListener("pagehide",stopBeat,{once:true});
  mount();
})();
