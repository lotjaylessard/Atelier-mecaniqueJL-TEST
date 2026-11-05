"use strict";
/**
 * S06-F05 : porte d'affichage du succes, AUCUNE ECRITURE.
 * "Confirmer" et une reponse RPC ne suffisent pas : lecture de controle
 * du BT + de la session pour confirmer note, main-d'oeuvre et etat posted.
 * A brancher uniquement APRES migration et RPC verifies sur Supabase TEST.
 */
class S06AckError extends Error {
  constructor(code,message){super(message);this.name="S06AckError";this.code=code;}
}
const reject=(code,message)=>{throw new S06AckError(code,message);};
const isInt=n=>Number.isSafeInteger(n)&&n>=0;
function verifiedPostingReceipt({request,ack,remoteSession,remoteGarage,localChangesPending=false}){
  if(localChangesPending)reject("pending","Changements locaux en attente : recharger les donnees");
  if(!request||typeof request!=="object"||!ack||typeof ack!=="object"||
     !remoteSession||typeof remoteSession!=="object"||
     !remoteGarage||typeof remoteGarage!=="object")
    reject("missing","Confirmation distante incomplete");
  const sessionId=request.sessionId;
  const workOrderId=request.workOrderId;
  if(typeof sessionId!=="string"||!sessionId.trim()||
     typeof workOrderId!=="string"||!workOrderId.trim()||
     !isInt(request.expectedSessionRevision)||
     !isInt(request.expectedGarageVersion)||
     !isInt(request.expectedConfirmedMs))
    reject("request","Demande de confirmation invalide");
  if(ack.session_id!==sessionId||ack.work_order_id!==workOrderId||
     ack.posted_labor_id!==sessionId||
     ack.session_revision!==request.expectedSessionRevision+1||
     ack.garage_version!==request.expectedGarageVersion+1||
     ack.confirmed_ms!==request.expectedConfirmedMs)
    reject("ack","Accuse de reception incompatible avec l'intervention");
  if(!isInt(remoteSession.revision)||
     remoteSession.id!==sessionId||remoteSession.status!=="posted"||
     remoteSession.posted_labor_id!==sessionId||
     remoteSession.revision<ack.session_revision||
     remoteSession.confirmed_ms!==request.expectedConfirmedMs)
    reject("session","Minuterie non confirmee apres relecture");
  if(remoteGarage.version!==ack.garage_version||
     !remoteGarage.data||!Array.isArray(remoteGarage.data.workorders))
    reject("garage","Garage non confirme apres relecture");
  const matching=remoteGarage.data.workorders.filter(wo=>wo&&String(wo.id)===workOrderId);
  if(matching.length!==1)reject("workorder","BT absent ou ambigu dans le cloud");
  const wo=matching[0];
  if(!Array.isArray(wo.labor)||typeof wo.notes!=="string")
    reject("workorder","Note ou main-d'oeuvre absente");
  const matchingLines=wo.labor.filter(l=>l&&l.timerSessionId===sessionId);
  const marker="[S06 minuterie : "+sessionId+"]";
  const matchingNotes=wo.notes.split(marker).length-1;
  if(matchingLines.length!==1||matchingNotes!==1)
    reject("duplicate","Intervention absente ou en double");
  const line=matchingLines[0];
  if(!Number.isFinite(Number(line.hours))||!Number.isFinite(Number(line.rate))||
     !Number.isFinite(Number(line.total))||
     Number(line.hours)!==Number(ack.hours)||
     Number(line.rate)!==Number(ack.hourly_rate)||
     Number(line.total)!==Number(ack.total))
    reject("amount","Montant cloud different de l'accuse de reception");
  if(typeof ack.work_order_number!=="string"||
     String(wo.number)!==ack.work_order_number)
    reject("workorder","Numero de BT different");
  return Object.freeze({
    kind:"verified-post",
    sessionId,
    workOrderId,
    workOrderNumber:ack.work_order_number,
    confirmedMs:ack.confirmed_ms,
    hours:Number(ack.hours),
    rate:Number(ack.hourly_rate),
    total:Number(ack.total),
    garageVersion:ack.garage_version
  });
}
function confirmationMessage(receipt){
  if(!receipt||receipt.kind!=="verified-post")
    reject("not_confirmed","Aucune sauvegarde verifiee : message de succes interdit");
  return Object.freeze({
    title:"Intervention enregistrée",
    labor:"Main-d'oeuvre : "+receipt.hours.toFixed(2)+" h — "+receipt.total.toFixed(2)+" $",
    note:"Note technique ajoutée au BT "+receipt.workOrderNumber+".",
    status:"Confirmation reçue et vérifiée auprès du serveur"
  });
}
module.exports={verifiedPostingReceipt,confirmationMessage,S06AckError};
