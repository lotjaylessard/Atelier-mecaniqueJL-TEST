// S08 — le vrai bouton Terminé, testé sans toucher à Supabase.
 // Usage : node audit/s08-bt-double-submit.test.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('async function finishWorkOrder(id)');
const end=html.indexOf('async function deleteWorkOrder(id)',start);
assert.ok(start>=0&&end>start,'finishWorkOrder introuvable');
const source=html.slice(start,end);
const make=new Function('env','with(env){'+source+';return finishWorkOrder;}');

function fixture({version=4,pending=false,km='12500',vehKm=12000}={}) {
 const messages=[],calls=[],events=[];
 let releaseVersion;
 const awaitedVersion=new Promise(resolve=>{releaseVersion=resolve});
 const wo={id:123,number:'BT-DOUBLE-FICTIF',status:'en_cours',
   clientId:'c',vehicleId:'v',clientName:'Client fictif',vehicleLabel:'1999 Mazda Test',
   vehicleKm:null,parts:[],labor:[]};
 const env={
   finishingWorkOrder:false,WORKORDERS:[wo],INVOICES:[],CLIENTS:[
      {id:'c',vehicles:[{id:'v',km:vehKm}]}
   ],
   document:{getElementById:id=>id==='woKmInput'?{value:km,style:{}}:null},
   loadWorkOrders(){},loadInvoices(){},
   alert:s=>messages.push(String(s)),confirm:()=>{calls.push('confirm');return true;},
   btToInvoiceNumber:n=>n.replace(/^BT/,'FA'),
   ACTIVE_GARAGE_ID:'g',SUPABASE_USER:{id:'u'},CLOUD_DATA_VERSION:3,
   CLOUD_CHANGE_REVISION:0,CLOUD_DATA_READY:true,
   CLOUD_LAST_CONFIRMED_SNAPSHOT:{},
   hasUnconfirmedCloudChanges:()=>pending,
   captureLocalGarageSnapshot:()=>({}),
   garageSnapshotsEquivalent:()=>true,
   console:{error(){}},
   sb:{from:()=>({select:()=>({eq:()=>({single:()=>{
      events.push('server-version');return awaitedVersion;
   }})})})}
 };
 return {wo,env,messages,calls,events,releaseVersion,
   click:make(env)};
}

async function doubleClick() {
 const t=fixture();
 const first=t.click(123);
 const second=t.click(123);
 assert.equal(t.calls.length,1,'Second clic: confirmation en double');
 assert.equal(t.events.length,1,'Second clic: deuxième requête réseau');
 t.releaseVersion({data:{version:4},error:null});
 await Promise.all([first,second]);
 assert.equal(t.messages.length,1);
 assert.match(t.messages[0],/Données Supabase modifiées/);
 assert.equal(t.wo.vehicleKm,null,'KM doit rester intact après refus serveur');
 assert.equal(t.env.finishingWorkOrder,false,'Verrou doit être libéré');
 console.log('OK deux clics rapides, une seule tentative');
}

async function pendingSync() {
 const t=fixture({pending:true});
 await t.click(123);
 assert.equal(t.calls.length,1);
 assert.equal(t.events.length,0,'Aucun contrôle réseau quand état non confirmé');
 assert.match(t.messages[0],/Synchronisation non confirmée/);
 assert.equal(t.wo.vehicleKm,null);
 assert.equal(t.env.finishingWorkOrder,false);
 console.log('OK sauvegarde non confirmée bloque la fermeture');
}

async function invalidKm() {
 const t=fixture({km:'Infinity'});
 await t.click(123);
 assert.equal(t.calls.length,0);
 assert.equal(t.events.length,0);
 assert.match(t.messages[0],/kilométrage valide/);
 assert.equal(t.wo.vehicleKm,null);
 console.log('OK kilométrage invalide bloqué sans mutation');
}

(async()=>{
 await doubleClick();
 await pendingSync();
 await invalidKm();
 console.log('3 tests de fermeture BT fictive réussis, aucune écriture.');
})().catch(err=>{console.error(err);process.exitCode=1;});
