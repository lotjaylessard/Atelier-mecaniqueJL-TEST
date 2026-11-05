"use strict";
const assert=require("node:assert/strict");
const {confirmedActor}=require("./s06-timer-actor.cjs");
const {quoteLabor,proposedWorkNote}=require("./s06-timer-posting.cjs");
const user={id:"auth-user-1",email:"a@example.com"};
const profile={user_id:"auth-user-1",display_name:"  Mécanicien TEST  "};
const confirmedAt="2026-11-05T20:50:00.000Z";
const actor=confirmedActor({authenticatedUser:user,profile,confirmedAt});
assert.deepEqual(actor,{actorId:"auth-user-1",actorName:"Mécanicien TEST",confirmedAt});
assert.ok(Object.isFrozen(actor));
const snapshot={workorders:[{id:12,number:"BT-12",status:"en_cours",labor:[],notes:"Inspection initiale"}],invoices:[]};
const session={id:"timer-1",work_order_id:"12",status:"paused",confirmed_ms:3600000,posted_labor_id:null};
const before=JSON.stringify(snapshot);
const quote=quoteLabor({snapshot,session,rate:85});
const note=proposedWorkNote({quote,description:"Réglage des freins",existingNotes:snapshot.workorders[0].notes,...actor});
assert.match(note.nextNotes,/Mécanicien TEST/);
assert.match(note.nextNotes,/auth-user-1/);
assert.match(note.nextNotes,/Réglage des freins/);
assert.match(note.nextNotes,/2026-11-05T20:50:00.000Z/);
assert.equal(JSON.stringify(snapshot),before,"La preparation ne modifie jamais le BT");
for(const args of [
 {authenticatedUser:null,profile,confirmedAt},
 {authenticatedUser:user,profile:null,confirmedAt},
 {authenticatedUser:user,profile:{user_id:"autre",display_name:"Intrus"},confirmedAt},
 {authenticatedUser:user,profile:{user_id:user.id,display_name:" "},confirmedAt},
 {authenticatedUser:user,profile:{user_id:user.id,display_name:"a".repeat(101)},confirmedAt},
 {authenticatedUser:user,profile,confirmedAt:"heure locale"},
])assert.throws(()=>confirmedActor(args));
assert.equal(user.email,"a@example.com");
console.log("S06 : identite employe, compte authentifie, profil correspondant, date, note historique et absence de mutation : OK.");
