"use strict";
/**
 * S06-F05 : preparation PURE de l'ajout d'heures au BT.
 * Ne sauvegarde RIEN. Le transfert reel exige une operation serveur atomique
 * sur garage_data.version ET garage_timer_sessions (revision + posted_labor_id).
 */
const {eligibleWorkOrder}=require("./s06-timer-eligibility.cjs");
class S06PostingError extends Error {
  constructor(code,message){super(message);this.name="S06PostingError";this.code=code;}
}
const fail=(code,message)=>{throw new S06PostingError(code,message);};
function quoteLabor({snapshot,session,rate,description="Main-d'œuvre (minuterie S06)"}) {
  if(!session||typeof session!=="object"||Array.isArray(session))
    fail("session","Session absente");
  if(typeof session.id!=="string"||!session.id.trim()||
     typeof session.work_order_id!=="string"||!session.work_order_id.trim())
    fail("session","Identifiants de session/BT invalides");
  if(session.status!=="paused"||session.posted_labor_id!=null)
    fail("status","Mettre en pause avant de transférer, ou session déjà transférée");
  const ms=Number(session.confirmed_ms);
  if(!Number.isSafeInteger(ms)||ms<=0||ms>86400000000)
    fail("duration","Temps confirmé invalide");
  const numericRate=Number(rate);
  if(rate===null||rate===""||typeof rate==="boolean"||
     !Number.isFinite(numericRate)||numericRate<0||numericRate>100000)
    fail("rate","Taux horaire invalide");
  if(typeof description!=="string"||!description.trim()||description.length>500)
    fail("description","Description invalide");
  const check=eligibleWorkOrder(snapshot,session.work_order_id);
  if(!check.ok)fail("workorder",check.reason);
  const wo=snapshot.workorders.find(w=>String(w.id)===check.workOrderId);
  if(!Array.isArray(wo.labor))fail("labor","Liste de main-d'œuvre du BT absente ou invalide");
  // Rejeter meme une session deja inscrite manuellement ou dupliquee.
  if(wo.labor.some(line=>line&&String(line.timerSessionId||"")===session.id))
    fail("duplicate","Ce temps a déjà été ajouté au BT");
  const hundredths=Math.round(ms/36000);
  if(hundredths<=0)fail("duration","Temps trop court pour créer une ligne facturable");
  const hours=hundredths/100;
  const roundedRate=Math.round(numericRate*100)/100;
  const total=Math.round(hundredths*roundedRate)/100;
  const item={
    timerSessionId:session.id,
    description:description.trim(),
    hours,
    rate:roundedRate,
    total
  };
  return Object.freeze({
    sessionId:session.id,
    workOrderId:check.workOrderId,
    workOrderNumber:check.number,
    confirmedMs:ms,
    hours,
    hourlyRate:roundedRate,
    total,
    // Objet propose, pas mutation du BT.
    proposedLine:Object.freeze(item)
  });
}
// Ne change jamais une ligne de BT : une future RPC atomique devra confirmer.
function pauseAction() {
  return Object.freeze({action:"pause",postsLabor:false,requiresConfirmation:false});
}
function finishAction(quote,confirmed) {
  if(!quote||!quote.sessionId||!quote.workOrderId)
    fail("quote","Proposition de main-d'œuvre absente");
  if(confirmed!==true)fail("confirmation","Confirmation explicite requise");
  return Object.freeze({action:"post",postsLabor:true,requiresConfirmation:true,
    sessionId:quote.sessionId,workOrderId:quote.workOrderId,
    expectedConfirmedMs:quote.confirmedMs,proposedLine:quote.proposedLine});
}
module.exports={quoteLabor,pauseAction,finishAction,S06PostingError};
