'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function between(start,end){
 const i=html.indexOf(start),j=html.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'Section introuvable: '+start);
 return html.slice(i,j);
}
test('carburant et dimensions des pneus restent visibles sans details déroulant',()=>{
 const form=between('function renderClientModal(id){','function initClientsModule(){');
 assert.match(form,/id="vehFuel"/);
 assert.match(form,/id="vehTireSize"/);
 assert.doesNotMatch(form,/Autres informations \(facultatif\)/);
});
test('la SO sélectionne exclusivement le véhicule enregistré du client courant',()=>{
 const source=between('function selectClientForQuote(c){','function prefill(kind){');
 assert.match(source,/addEventListener\("client:vehicle-saved"/);
 assert.match(source,/String\(clientId\)!==String\(selectedFastClientId\)/);
 assert.match(source,/String\(item\.id\)===String\(vehicleId\)/);
 assert.match(source,/vehicleChoice\.value=String\(vehicleId\)/);
 assert.match(source,/vehicleChoice\.dispatchEvent\(new Event\("change"\)\)/);
});
test('le formulaire SO garde les trois champs et le mini calendrier',()=>{
 const form=between('<section id="s08SchedulePanel"','<p id="s08ConvertedBT"');
 for(const id of ['s08ScheduleDate','s08ScheduleTime','s08ScheduleDuration','s09ScheduleDayBookings'])
  assert.ok(form.includes('id="'+id+'"'));
 assert.match(html,/scheduleDate\.showPicker\(\)/);
 assert.match(html,/#s08QuoteViewer #s08SchedulePanel \.s08-schedule-fields\{display:grid/);
});
test('lire les rendez-vous est consultatif et ne remplace pas la sauvegarde existante',()=>{
 const source=between('async function s09LoadBookings(){','get("s08QuickApprove")?.addEventListener');
 assert.match(source,/\.from\("garage_quotes"\)/);
 assert.match(source,/\.eq\("garage_id",ACTIVE_GARAGE_ID\)/);
 assert.match(source,/\.eq\("user_id",auth\.user\.id\)/);
 assert.match(source,/token!==s09BookingsToken/);
 assert.match(source,/s09DisplayBookings\(\)/);
 assert.match(source,/saveQuoteWorkflowChanges\(\{appointment\}\)/);
});
test('le détecteur de plages chevauchantes ne signale pas deux plages adjacentes',()=>{
 function overlaps(a,durationA,b,durationB){
  return a<b+durationB&&b<a+durationA;
 }
 assert.equal(overlaps(9*60,60,10*60,60),false);
 assert.equal(overlaps(9*60,90,10*60,60),true);
 assert.equal(overlaps(9*60,60,8*60,120),true);
 assert.match(html,/start<otherStart\+otherDuration&&otherStart<start\+duration/);
});
