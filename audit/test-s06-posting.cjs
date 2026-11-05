"use strict";
const assert=require("node:assert/strict");
const {quoteLabor,pauseAction,finishAction,proposedWorkNote}=require("./s06-timer-posting.cjs");
const snapshot={workorders:[{id:12,number:"BT-12",status:"en_cours",labor:[]}],invoices:[]};
const session={id:"session-abc",work_order_id:"12",status:"paused",confirmed_ms:5400000,posted_labor_id:null};
const saved=JSON.stringify({snapshot,session});
const quote=quoteLabor({snapshot,session,rate:90});
assert.equal(quote.hours,1.5);
assert.equal(quote.total,135);
assert.equal(quote.proposedLine.timerSessionId,session.id);
assert.deepEqual(pauseAction(),{action:"pause",postsLabor:false,requiresConfirmation:false});
assert.throws(()=>finishAction(quote,false),e=>e.code==="confirmation");
assert.throws(()=>finishAction(quote),e=>e.code==="confirmation");
const action=finishAction(quote,true);
assert.equal(action.action,"post");
assert.equal(action.postsLabor,true);
assert.equal(action.expectedConfirmedMs,5400000);
assert.equal(action.proposedLine.total,135);
assert.equal(JSON.stringify({snapshot,session}),saved,"Aucune mutation du BT ou de la session");
assert.throws(()=>quoteLabor({snapshot,session:{...session,status:"running"},rate:90}),e=>e.code==="status");
assert.throws(()=>quoteLabor({snapshot,session:{...session,status:"posted",posted_labor_id:"123"},rate:90}),e=>e.code==="status");
assert.throws(()=>quoteLabor({snapshot,session:{...session,confirmed_ms:0},rate:90}),e=>e.code==="duration");
assert.throws(()=>quoteLabor({snapshot,session:{...session,confirmed_ms:100},rate:90}),e=>e.code==="duration");
assert.throws(()=>quoteLabor({snapshot,session:{...session,confirmed_ms:NaN},rate:90}),e=>e.code==="duration");
assert.throws(()=>quoteLabor({snapshot,session,rate:-1}),e=>e.code==="rate");
assert.throws(()=>quoteLabor({snapshot,session,rate:""}),e=>e.code==="rate");
assert.throws(()=>quoteLabor({snapshot,session,rate:"invalid"}),e=>e.code==="rate");
assert.throws(()=>quoteLabor({snapshot,session,rate:Infinity}),e=>e.code==="rate");
assert.throws(()=>quoteLabor({snapshot,session,rate:90,description:""}),e=>e.code==="description");
for(const bad of [
 {workorders:[],invoices:[]},
 {workorders:[{...snapshot.workorders[0],status:"termine",labor:[]}],invoices:[]},
 {workorders:snapshot.workorders,invoices:[{workOrderNumber:"BT-12",status:"unpaid"}]},
 {workorders:snapshot.workorders,invoices:[{workOrderNumber:"BT-12",status:"paid"}]},
 {workorders:[{...snapshot.workorders[0],labor:[{timerSessionId:"session-abc"}]}],invoices:[]},
 {workorders:[{...snapshot.workorders[0],labor:null}],invoices:[]}
])assert.throws(()=>quoteLabor({snapshot:bad,session,rate:90}),e=>["workorder","duplicate","labor"].includes(e.code));
const free=quoteLabor({snapshot,session,rate:0});
assert.equal(free.total,0);
assert.equal(free.hours,1.5);
assert.equal(JSON.stringify({snapshot,session}),saved);
const actor={actorId:"auth-user-123",actorName:"Employé TEST",confirmedAt:"2026-11-05T20:00:00.000Z"};
const note=proposedWorkNote({quote,description:"Remplacement des freins",existingNotes:"Contrôle initial OK",...actor});
assert.match(note.noteEntry,/Employé TEST/);
assert.match(note.noteEntry,/auth-user-123/);
assert.match(note.noteEntry,/2026-11-05T20:00:00.000Z/);
assert.match(note.noteEntry,/Travail effectue : Remplacement des freins/);
assert.match(note.noteEntry,/Temps confirme : 1 h 30 min 00 s/);
assert.match(note.noteEntry,/Main-d'oeuvre : 1.50 h/);
assert.ok(note.nextNotes.startsWith("Contrôle initial OK\n\n"));
assert.equal(note.nextNotes.split(note.marker).length,2,"Une seule note S06");
assert.throws(()=>proposedWorkNote({quote,description:"Encore",existingNotes:note.nextNotes,...actor}),e=>e.code==="duplicate");
assert.throws(()=>proposedWorkNote({quote,description:"  ",...actor}),e=>e.code==="description");
assert.throws(()=>proposedWorkNote({quote,description:"a".repeat(2001),...actor}),e=>e.code==="description");
assert.throws(()=>proposedWorkNote({quote,description:"Test",actorName:"Employé TEST",confirmedAt:actor.confirmedAt}),e=>e.code==="actor");
assert.throws(()=>proposedWorkNote({quote,description:"Test",actorId:actor.actorId,confirmedAt:actor.confirmedAt}),e=>e.code==="actor");
assert.throws(()=>proposedWorkNote({quote,description:"Test",actorId:actor.actorId,actorName:actor.actorName,confirmedAt:"date invalide"}),e=>e.code==="date");
assert.equal(JSON.stringify({snapshot,session}),saved,"Toujours aucune mutation");
console.log("S06-F05 : devis main-d'oeuvre, pause, confirmation, anti-doublon et BT paye/termine : OK (sans ecriture).");
