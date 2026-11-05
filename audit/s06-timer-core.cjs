"use strict";
/**
 * S06-F01: coeur pur de la minuterie persistante (aucune ecriture cloud).
 * Mode A : fermeture => pause. Une fermeture brutale peut echapper au navigateur:
 * le temps est alors arrete au DERNIER heartbeat confirme et non a l'heure du retour.
 * Les appels doivent etre serialises via une ecriture CAS / version cote serveur.
 */
const MAX_DELTA_MS = 24 * 60 * 60 * 1000;
function validMillis(value, label){
  if(!Number.isSafeInteger(value) || value < 0) throw new TypeError(label + " invalide");
  return value;
}
function validClock(now){
  if(!Number.isSafeInteger(now) || now < 0) throw new TypeError("Horodatage invalide");
  return now;
}
function validate(session){
  if(!session || typeof session!=="object") throw new TypeError("Session absente");
  if(typeof session.id!=="string" || !session.id.trim()) throw new TypeError("ID session absent");
  if(typeof session.workOrderId!=="string" || !session.workOrderId.trim()) throw new TypeError("BT absent");
  if(!["paused","running","posted"].includes(session.status)) throw new TypeError("Etat inconnu");
  validMillis(session.confirmedMs,"Temps confirme");
  validClock(session.updatedAt);
  if(session.status==="running"){
    validClock(session.lastHeartbeatAt);
    if(session.lastHeartbeatAt>session.updatedAt) throw new TypeError("Heartbeat futur");
  }
  return session;
}
function makeSession({id,workOrderId,now}){
  const s={id:String(id||""),workOrderId:String(workOrderId||""),status:"paused",
    confirmedMs:0,lastHeartbeatAt:null,updatedAt:validClock(now),version:0,postedLaborId:null};
  return validate(s);
}
function start(session,now){
  const s=validate(session);validClock(now);
  if(s.status==="posted") throw new Error("Temps deja facture");
  if(s.status==="running") throw new Error("Session deja en cours");
  if(now<s.updatedAt) throw new Error("Horloge en recul");
  return {...s,status:"running",lastHeartbeatAt:now,updatedAt:now};
}
function heartbeat(session,now){
  const s=validate(session);validClock(now);
  if(s.status!=="running") throw new Error("Session non active");
  const delta=now-s.lastHeartbeatAt;
  if(delta<0 || delta>MAX_DELTA_MS) throw new Error("Intervalle invalide");
  return {...s,confirmedMs:validMillis(s.confirmedMs+delta,"Temps cumule"),
    lastHeartbeatAt:now,updatedAt:now};
}
function pause(session,now){
  const s=validate(session);validClock(now);
  if(s.status==="posted") throw new Error("Session deja facturee");
  if(s.status==="paused") return {...s};
  return {...heartbeat(s,now),status:"paused",lastHeartbeatAt:null};
}
function recoverAfterClose(session){
  const s=validate(session);
  if(s.status!=="running") return {...s};
  // Pas de temps ajoute apres le dernier heartbeat sauvegarde.
  return {...s,status:"paused",lastHeartbeatAt:null};
}
function liveMs(session,now){
  const s=validate(session);validClock(now);
  if(s.status!=="running") return s.confirmedMs;
  const delta=now-s.lastHeartbeatAt;
  if(delta<0) return s.confirmedMs;
  return s.confirmedMs+Math.min(delta,MAX_DELTA_MS);
}
function finalize(session,laborId,now){
  const s=validate(session);validClock(now);
  if(s.status!=="paused") throw new Error("Mettre en pause avant facturation");
  if(!s.confirmedMs) throw new Error("Aucune duree");
  if(s.postedLaborId) throw new Error("Deja ajoute");
  if(typeof laborId!=="string"||!laborId.trim()) throw new Error("Ligne main-d'oeuvre absente");
  return {...s,status:"posted",postedLaborId:laborId,updatedAt:now};
}
function decimalHours(ms){validMillis(ms,"Duree");return Math.round(ms/36000)/100;}
module.exports={makeSession,start,heartbeat,pause,recoverAfterClose,liveMs,finalize,decimalHours,validate};
