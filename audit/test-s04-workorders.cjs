// S04-F01/F02 - tests non destructifs; aucune connexion Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html','utf8');
const start = html.indexOf('function finishWorkOrder(id){');
const stop = html.indexOf('  // 🔄 Forcer lecture directe du champ KM',start);
assert.ok(start > 0 && stop > start,'Protection S04-F01 introuvable');
const guard = html.slice(start,stop) + '\n}';
function testGuard(wo, invoices){
 const logs = {alerts:[],loads:0};
 const ctx = {
  WORKORDERS:[structuredClone(wo)], INVOICES:structuredClone(invoices),
  loadWorkOrders(){logs.loads++;},loadInvoices(){logs.loads++;},
  btToInvoiceNumber(n){return String(n).replace(/^BT/,'FA');},
  alert(msg){logs.alerts.push(msg);}
 };
 vm.createContext(ctx);
 vm.runInContext(guard,ctx);
 ctx.finishWorkOrder(wo.id);
 return logs;
}
const closed = testGuard({id:1,number:'BT-001',status:'termine'},[]);
assert.equal(closed.alerts.length,1);
assert.equal(closed.loads,2);
const billed = testGuard({id:2,number:'BT-002',status:'billed'},[]);
assert.equal(billed.alerts.length,1);
const alreadyInvoiced = testGuard({id:3,number:'BT-003',status:'en_cours'},[{workOrderNumber:'BT-003'}]);
assert.equal(alreadyInvoiced.alerts.length,1);
const sameInvoiceNumber = testGuard({id:4,number:'BT-004',status:'en_cours'},[{number:'FA-004'}]);
assert.equal(sameInvoiceNumber.alerts.length,1);
assert.ok(html.includes('if (wo.status !== "en_cours"'), 'Revalidation apres confirmation absente');
assert.ok(html.includes('<th>Description</th>'), 'Colonne Description absente');
assert.ok(html.includes('class="wo-description"'), 'Description non rendue');
assert.ok(html.includes('${wo.description || ""}'), 'Description non recherchable');
assert.ok(html.includes('function woContactInfo(wo)'), 'Recherche client/vehicule absente');
assert.ok(html.includes('String(c.id) === String(wo.clientId)'), 'Recherche client par identifiant absente');
assert.ok(html.includes('String(v.id) === String(wo.vehicleId)'), 'Recherche vehicule par identifiant absente');
assert.ok(html.includes('function copyWorkOrderVIN(button)'), 'Bouton copier VIN absent');
assert.ok(html.includes('navigator.clipboard.writeText(vin)'), 'Copie VIN absente');
assert.ok(html.includes('woContactHtml(wo)'), 'En-tete professionnel absent');
assert.ok(html.includes('id="woDescriptionEdit"'), 'Edition description absente');
console.log('S04-F03 : entete client/vehicule et copie VIN verifie (statique).');
console.log('S04-F01/F02 : garde anti-doublon et colonne description verifiees (simulees).');

const createdWoCode = html.slice(html.indexOf('function saveNewWorkOrder()'), html.indexOf('function renderPartPicker()'));
assert.ok(createdWoCode.includes('vehicleKm: woValidKm(vehicleKm),'),
  'Creation BT : kilometrage du vehicule non enregistre');
assert.ok(html.includes('const woKmDisplay = woDisplayKm(wo);'),
  'Affichage BT : calcul du kilometrage absent');
assert.ok(html.includes('const current = woValidKm(vehicle?.km);'),
  'BT en cours : kilometrage de repli absent');
console.log('S04-F04 : pre-remplissage du kilometrage et compatibilite anciens BT verifies.');

const infoStart = html.indexOf('function woContactInfo(wo){');
const infoEnd = html.indexOf('function woContactHtml(wo){',infoStart);
assert.ok(infoStart > 0 && infoEnd > infoStart,'Resolveur KM S04-F05 absent');
function runKm(wo, clients){
 const ctx={
  STORAGE:{clients:'test-clients'},
  loadArrayFromStorage(){return structuredClone(clients);}
 };
 vm.createContext(ctx);
 vm.runInContext(html.slice(infoStart,infoEnd),ctx);
 return ctx.woDisplayKm(structuredClone(wo));
}
const clientData=[{id:1,name:'TEST FACTURE',vehicles:[
  {id:2,year:1999,make:'Mazda',model:'Miata',km:12000}
]}];
assert.equal(runKm({clientId:1,vehicleId:2,vehicleLabel:'1999 Mazda Miata',status:'en_cours'},clientData).value,12000);
assert.equal(runKm({clientId:1,vehicleId:2,vehicleKm:8000,status:'en_cours'},clientData).value,8000);
assert.equal(runKm({clientId:1,vehicleId:2,status:'termine'},clientData).value,null);
assert.equal(runKm({clientId:1,vehicleId:2,status:'en_cours'},[]).source,'missing');
assert.equal(runKm({clientId:1,vehicleId:2,status:'en_cours'},[{...clientData[0],vehicles:[{...clientData[0].vehicles[0],km:'12 000'}]}]).value,12000);
assert.ok(html.includes('placeholder="KM non renseigné"'));
console.log('S04-F05 : KM fiche vehicule, historique et affichage vide verifies (simules).');
