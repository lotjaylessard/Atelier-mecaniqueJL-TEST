"use strict";
/**
 * S06-F05 — Simulation d'une transaction indivisible (PURE, aucun SQL).
 * Le serveur devra verrouiller garage_data + garage_timer_sessions dans UNE
 * transaction PostgreSQL puis appliquer EXACTEMENT les memes refus.
 * Ne PAS utiliser cette fonction pour ecrire sur Supabase depuis le navigateur.
 */
const {quoteLabor,proposedWorkNote,finishAction}=require("./s06-timer-posting.cjs");
const {confirmedActor}=require("./s06-timer-actor.cjs");

class S06AtomicError extends Error{
  constructor(code,message){super(message);this.name="S06AtomicError";this.code=code;}
}
const fail=(code,msg)=>{throw new S06AtomicError(code,msg);};

function prepareAtomicPosting({
  garageSnapshot,garageVersion,expectedGarageVersion,
  session,expectedSessionRevision,
  authenticatedUser,profile,confirmedAt,description,rate,confirmed
}){
  if(confirmed!==true)fail("confirmation","Confirmer explicitement le transfert");
  if(!Number.isSafeInteger(garageVersion)||garageVersion<0||
     !Number.isSafeInteger(expectedGarageVersion)||expectedGarageVersion!==garageVersion)
    fail("conflict","Version du garage modifiée : recharger le BT");
  if(!session||!Number.isSafeInteger(session.revision)||
     !Number.isSafeInteger(expectedSessionRevision)||
     expectedSessionRevision!==session.revision)
    fail("conflict","Minuterie modifiée sur un autre appareil");
  // A la transaction reelle, auth.uid() doit etre impose par PostgreSQL.
  const actor=confirmedActor({authenticatedUser,profile,confirmedAt});
  if(session.user_id!==actor.actorId)
    fail("owner","Cette minuterie n'appartient pas au compte connecté");
  if(typeof session.garage_id!=="string"||!session.garage_id.trim())
    fail("garage","Garage de la minuterie invalide");
  if(!garageSnapshot||typeof garageSnapshot!=="object"||Array.isArray(garageSnapshot))
    fail("garage","Snapshot du garage absent");
  const quote=quoteLabor({
    snapshot:garageSnapshot,session,rate,
    description:"Main-d'œuvre (minuterie S06)"
  });
  const index=garageSnapshot.workorders.findIndex(wo=>
    wo&&String(wo.id)===quote.workOrderId);
  if(index<0)fail("workorder","Bon de travail absent");
  const wo=garageSnapshot.workorders[index];
  const notes=proposedWorkNote({
    quote,description,existingNotes:wo.notes||"",...actor
  });
  const command=finishAction(quote,true);
  // Reprendre le snapshot sans toucher à l'objet source ; aucune ligne
  // n'est générée si une validation a échoué.
  const newWorkorders=garageSnapshot.workorders.map((row,i)=>
    i===index?{
      ...row,
      labor:[...row.labor,{...command.proposedLine}],
      notes:notes.nextNotes
    }:row
  );
  const nextGarageSnapshot={...garageSnapshot,workorders:newWorkorders};
  const nextSession={
    ...session,status:"posted",posted_labor_id:session.id,
    last_heartbeat_at:null,revision:session.revision+1,
    updated_at:confirmedAt
  };
  return {
    expectedGarageVersion,expectedSessionRevision,
    nextGarageVersion:garageVersion+1,
    nextGarageSnapshot,nextSession,
    noteMarker:notes.marker,
    actor:{...actor}
  };
}
module.exports={prepareAtomicPosting,S06AtomicError};
