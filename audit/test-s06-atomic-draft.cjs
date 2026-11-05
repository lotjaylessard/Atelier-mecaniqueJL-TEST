"use strict";
const assert=require("node:assert/strict");
const {prepareAtomicPosting}=require("./s06-timer-atomic-draft.cjs");
const base={
  garageSnapshot:{
    workorders:[
      {id:"bt-1",number:"BT-001",status:"en_cours",labor:[{description:"Diagnostic",hours:.5,rate:80,total:40}],notes:"Note originale"},
      {id:"bt-2",number:"BT-002",status:"en_cours",labor:[],notes:"Autre BT"}
    ],
    invoices:[],settings:{},clients:[{id:1}]
  },
  garageVersion:12,expectedGarageVersion:12,
  session:{id:"timer-1",user_id:"user-1",garage_id:"garage-test",work_order_id:"bt-1",
    status:"paused",confirmed_ms:5400000,revision:3,posted_labor_id:null,last_heartbeat_at:null},
  expectedSessionRevision:3,
  authenticatedUser:{id:"user-1"},
  profile:{user_id:"user-1",display_name:"Mécanicien TEST"},
  confirmedAt:"2026-11-05T21:00:00.000Z",
  description:"Remplacement du moteur",rate:100,confirmed:true
};
const before=JSON.stringify(base);
const output=prepareAtomicPosting(base);
assert.equal(output.nextGarageVersion,13);
assert.equal(output.nextSession.revision,4);
assert.equal(output.nextSession.status,"posted");
assert.equal(output.nextSession.posted_labor_id,"timer-1");
assert.equal(output.nextGarageSnapshot.workorders[0].labor.length,2);
assert.equal(output.nextGarageSnapshot.workorders[0].labor[1].timerSessionId,"timer-1");
assert.equal(output.nextGarageSnapshot.workorders[0].labor[1].total,150);
assert.match(output.nextGarageSnapshot.workorders[0].notes,/Note originale/);
assert.match(output.nextGarageSnapshot.workorders[0].notes,/Remplacement du moteur/);
assert.match(output.nextGarageSnapshot.workorders[0].notes,/Mécanicien TEST/);
assert.match(output.nextGarageSnapshot.workorders[0].notes,/2026-11-05T21:00:00.000Z/);
assert.deepEqual(output.nextGarageSnapshot.workorders[1],base.garageSnapshot.workorders[1]);
assert.deepEqual(output.nextGarageSnapshot.invoices,[]);
assert.deepEqual(output.nextGarageSnapshot.clients,base.garageSnapshot.clients);
assert.equal(JSON.stringify(base),before,"L'entree n'est jamais mutee");
const bad=(modification,code)=>{
 const input={...base,...modification};
 const snapshot=JSON.stringify(input);
 assert.throws(()=>prepareAtomicPosting(input),e=>!code||e.code===code);
 assert.equal(JSON.stringify(input),snapshot,"Refus sans aucune modification");
};
bad({confirmed:false},"confirmation");
bad({expectedGarageVersion:11},"conflict");
bad({expectedSessionRevision:2},"conflict");
bad({authenticatedUser:{id:"intrus"}},"owner");
bad({profile:{user_id:"intrus",display_name:"Intrus"}});
bad({session:{...base.session,status:"running"}}); 
bad({session:{...base.session,status:"posted",posted_labor_id:"timer-1"}});
bad({session:{...base.session,user_id:"intrus"}},"owner");
bad({garageSnapshot:{...base.garageSnapshot,workorders:[
 {...base.garageSnapshot.workorders[0],status:"termine"},base.garageSnapshot.workorders[1]]}});
bad({garageSnapshot:{...base.garageSnapshot,invoices:[{workOrderNumber:"BT-001",status:"paid"}]}});
bad({garageSnapshot:{...base.garageSnapshot,invoices:[{workOrderNumber:"BT-001",status:"partial"}]}});
bad({garageSnapshot:{...base.garageSnapshot,workorders:[
 {...base.garageSnapshot.workorders[0],labor:[{timerSessionId:"timer-1"}]},base.garageSnapshot.workorders[1]]}});
bad({garageSnapshot:{...base.garageSnapshot,workorders:[
 {...base.garageSnapshot.workorders[0],notes:"[S06 minuterie : timer-1]"},base.garageSnapshot.workorders[1]]}});
bad({description:"  "});
bad({rate:-2});
bad({session:{...base.session,confirmed_ms:0}});
bad({session:{...base.session,garage_id:""}}, "garage");
// Un second appel base sur les revisions precedentes doit echouer : CAS
bad({garageVersion:13,expectedGarageVersion:12},"conflict");
const replay={
 ...base,garageSnapshot:output.nextGarageSnapshot,garageVersion:13,expectedGarageVersion:13,
 session:output.nextSession,expectedSessionRevision:4
};
assert.throws(()=>prepareAtomicPosting(replay),"Session deja transferee");
console.log("S06-F05 : transaction simulée indivisible, CAS versions, auteur, note + ligne uniques, refus sur erreur : OK.");
