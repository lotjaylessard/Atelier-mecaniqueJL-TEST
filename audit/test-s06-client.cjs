"use strict";
const assert=require("node:assert/strict");
const {createAdapter}=require("./s06-timer-client.cjs");
const UID="person-1";
const DB=new Map();
let calls=0, rejectNetwork=false, conflictNext=false;
function copy(x){return JSON.parse(JSON.stringify(x));}
const client={
  from(table){
    assert.equal(table,"garage_timer_sessions");
    return {select(){
      return {eq(column,value){
        assert.equal(column,"user_id");assert.equal(value,UID);
        return {order:async()=>({data:[...DB.values()].filter(s=>s.user_id===UID).map(copy),error:null})};
      }};
    }};
  },
  async rpc(name,args){
    calls++;
    assert.equal(name,"s06_timer_transition");
    if(rejectNetwork)return {data:null,error:{message:"Connexion perdue"}};
    if(conflictNext){conflictNext=false;return {data:null,error:{code:"40001",message:"revision conflictuelle"}};}
    if(args.p_action==="create"){
      const row={id:"session-1",user_id:UID,garage_id:"garage-test-1",work_order_id:args.p_work_order_id,status:"paused",confirmed_ms:0,last_heartbeat_at:null,revision:0,posted_labor_id:null,updated_at:"now"};
      DB.set(row.id,row);return {data:copy(row),error:null};
    }
    const old=DB.get(args.p_id);if(!old)return {data:null,error:{message:"Session inconnue"}};
    if(old.revision!==args.p_expected_revision)return {data:null,error:{code:"40001",message:"Conflit"}};
    const next={...old,revision:old.revision+1};
    if(args.p_action==="start"){if(old.status!=="paused")return {data:null,error:{message:"Actif"}};next.status="running";next.last_heartbeat_at="now";}
    else if(args.p_action==="heartbeat"){next.confirmed_ms+=10000;}
    else {next.status="paused";next.last_heartbeat_at=null;}
    DB.set(next.id,next);return {data:copy(next),error:null};
  }
};
(async()=>{
  let online=true;
  const a=createAdapter({client,uid:UID,isOnline:()=>online});
  assert.deepEqual(await a.read(),[]);
  const newRow=await a.transition({id:null,action:"create",revision:0,workOrderId:"BT-123"});
  assert.equal(newRow.status,"paused");
  assert.equal(newRow.garage_id,"garage-test-1");
  assert.equal((await a.read())[0].garage_id,"garage-test-1");
  const active=await a.transition({id:newRow.id,action:"start",revision:0});
  assert.equal(active.status,"running");
  const beat=await a.transition({id:active.id,action:"heartbeat",revision:1});
  assert.equal(beat.confirmed_ms,10000);
  const paused=await a.transition({id:beat.id,action:"pause",revision:2});
  assert.equal(paused.status,"paused");
  assert.equal(paused.confirmed_ms,10000);
  const second=createAdapter({client,uid:UID});
  assert.equal((await second.read())[0].revision,3);
  let before=calls;
  await assert.rejects(()=>a.transition({id:beat.id,action:"heartbeat",revision:1}),/Recharger/);
  assert.equal(calls,before,"Revision stale refusee avant RPC");
  conflictNext=true;
  await assert.rejects(()=>a.transition({id:paused.id,action:"start",revision:3}),e=>e.code==="conflict");
  assert.equal(a.snapshot[0].status,"paused","Conflit ne change pas snapshot");
  online=false;before=calls;
  await assert.rejects(()=>a.transition({id:paused.id,action:"start",revision:3}),e=>e.code==="offline");
  assert.equal(calls,before,"Hors ligne ne fait aucune ecriture");
  online=true;rejectNetwork=true;
  await assert.rejects(()=>a.transition({id:paused.id,action:"start",revision:3}),e=>e.code==="remote");
  assert.equal(a.snapshot[0].status,"paused","Echec distant ne simule pas confirmation");
  rejectNetwork=false;
  await a.read();
  const resumed=await a.transition({id:paused.id,action:"start",revision:3});
  assert.equal(resumed.revision,4);
  await assert.rejects(()=>a.transition({id:resumed.id,action:"posted",revision:4}),e=>e.code==="action");
  assert.equal(a.snapshot[0].confirmed_ms,10000);
  console.log("S06-F03 : create/start/heartbeat/pause, autre appareil, conflits, hors-ligne, erreur reseau, non-facturation : OK.");
})().catch(e=>{console.error(e);process.exitCode=1;});
