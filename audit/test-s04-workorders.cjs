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
assert.ok(html.includes('woMatchesSearch(wo, search)'), 'Description non recherchable');
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

const listStart = html.indexOf('function renderWorkOrders(){');
const listEnd = html.indexOf('function finishWorkOrder(id){',listStart);
const listCode = html.slice(listStart,listEnd);
assert.ok(listCode.includes('const kmDisplay = woDisplayKm(wo);'), 'Liste BT : resolveur de kilometrage absent');
assert.ok(listCode.includes('const kmLabel = kmDisplay.value === null ? "Non renseigné"'), 'Liste BT : texte KM absent');
assert.ok(listCode.includes('kmDisplay.source === "vehicle"'), 'Liste BT : source fiche vehicule non identifiee');
assert.ok(!listCode.includes('<b>${wo.vehicleKm || "-"}</b>'), 'Liste BT : ancien rendu KM encore utilise');
console.log('S04-F06 : liste BT affiche le meme KM que le detail, sans modification historique.');

const displayBegin = html.indexOf('function getCloudSyncDisplayState(){');
const displayEnd = html.indexOf('function renderCloudSyncIndicator(){', displayBegin);
assert.ok(displayBegin >= 0 && displayEnd > displayBegin,'Indicateur cloud S04-F07 introuvable');
assert.ok(html.includes('id="cloudSyncIndicator"'),'Zone de statut cloud absente');
function syncState(overrides={}){
  const ctx = {CLOUD_SYNC_FAILED:false,SUPABASE_USER:{id:'test'},ACTIVE_GARAGE_ID:'garage-test',
    CLOUD_DATA_READY:true,CLOUD_SYNC_IN_PROGRESS:false,CLOUD_SYNC_PENDING:false,
    CLOUD_SYNC_DIRTY:false,cloudSyncTimer:null,CLOUD_LAST_CONFIRMED_SNAPSHOT:{},
    CLOUD_DATA_VERSION:1,...overrides};
  vm.createContext(ctx);
  vm.runInContext(html.slice(displayBegin,displayEnd),ctx);
  return ctx.getCloudSyncDisplayState().text;
}
assert.match(syncState(),/Synchronisé/);
assert.match(syncState({CLOUD_SYNC_DIRTY:true}),/Enregistrement/);
assert.match(syncState({CLOUD_SYNC_IN_PROGRESS:true}),/Enregistrement/);
assert.match(syncState({cloudSyncTimer:1}),/Enregistrement/);
assert.match(syncState({CLOUD_SYNC_FAILED:true}),/Erreur/);
assert.match(syncState({CLOUD_DATA_READY:false}),/indisponible/);
assert.match(syncState({CLOUD_LAST_CONFIRMED_SNAPSHOT:null}),/vérifier/);
console.log('S04-F07 : indicateur cloud lecture seule testé avec sept scénarios simulés.');

const guardStart = html.indexOf('function hasUnconfirmedCloudChanges(){');
const guardEnd = html.indexOf('window.addEventListener("beforeunload", warnBeforeLeavingWithPendingCloudChanges);', guardStart);
assert.ok(guardStart >= 0 && guardEnd > guardStart, 'S04-F08 : garde beforeunload absente');
const guardSource = html.slice(guardStart,guardEnd);
function checkExit(flags={}){
 const context={
   CLOUD_SYNC_FAILED:false, CLOUD_SYNC_DIRTY:false, CLOUD_SYNC_PENDING:false,
   CLOUD_SYNC_IN_PROGRESS:false, cloudSyncTimer:null,...flags
 };
 vm.createContext(context);
 vm.runInContext(guardSource,context);
 const event={prevented:false,preventDefault(){this.prevented=true}};
 context.warnBeforeLeavingWithPendingCloudChanges(event);
 return {shouldWarn:context.hasUnconfirmedCloudChanges(),prevented:event.prevented,returnValue:event.returnValue};
}
assert.equal(checkExit().prevented,false, 'Faux avertissement apres synchronisation');
assert.equal(checkExit({CLOUD_SYNC_DIRTY:true}).prevented,true, 'Modification en attente non protegee');
assert.equal(checkExit({CLOUD_SYNC_IN_PROGRESS:true}).prevented,true, 'Ecriture en cours non protegee');
assert.equal(checkExit({CLOUD_SYNC_PENDING:true}).prevented,true, 'Sauvegarde supplementaire non protegee');
assert.equal(checkExit({cloudSyncTimer:1}).prevented,true, 'Minuteur de sauvegarde non protege');
assert.equal(checkExit({CLOUD_SYNC_FAILED:true}).prevented,true, 'Echec cloud non protege');
assert.equal(checkExit({CLOUD_SYNC_FAILED:true}).returnValue, '', 'Confirmation navigateur non declenchee');
assert.ok(html.includes('window.addEventListener("beforeunload", warnBeforeLeavingWithPendingCloudChanges)'));
console.log('S04-F08 : confirmation de fermeture testee en six etats simules.');

const bannerStart = html.indexOf('function updateCloudRecoveryBannerAppearance(){');
const bannerEnd = html.indexOf('/* ===================== TEST : FUSION MANUELLE',bannerStart);
assert.ok(bannerStart >= 0 && bannerEnd > bannerStart, 'S04-F09 : distinction copie / erreur absente');
const bannerFunction = html.slice(bannerStart,bannerEnd);
function testBanner({failed=false,ready=true,connected=true}={}){
 const box={dataset:{capturedAt:'2026-11-04 02:15'},style:{}};
 const msg={textContent:''};
 const ctx={
  CLOUD_SYNC_FAILED:failed,CLOUD_DATA_READY:ready,
  SUPABASE_USER:connected?{id:'test'}:null,
  ACTIVE_GARAGE_ID:connected?'test':null,
  document:{getElementById:(id)=>id==='cloudRecoveryBanner'?box:id==='cloudRecoveryBannerMessage'?msg:null}
 };
 vm.createContext(ctx);
 vm.runInContext(bannerFunction,ctx);
 ctx.updateCloudRecoveryBannerAppearance();
 return {box,msg};
}
const oldCopy=testBanner();
assert.match(oldCopy.msg.textContent,/Ancienne copie/);
assert.match(oldCopy.box.style.border,/70b9ed/);
assert.match(oldCopy.msg.textContent,/2026-11-04/);
const errorCopy=testBanner({failed:true});
assert.match(errorCopy.msg.textContent,/Erreur cloud active/);
assert.match(errorCopy.box.style.border,/ff7777/);
assert.match(testBanner({ready:false}).msg.textContent,/Erreur cloud active/);
assert.match(testBanner({connected:false,ready:false}).msg.textContent,/Ancienne copie/);
assert.ok(html.includes('updateCloudRecoveryBannerAppearance();'), 'Rafraichissement de statut manquant');
console.log('S04-F09 : copie historique bleue et erreur active rouge verifiees.');

const searchStart = html.indexOf('function woSearchNormalize(value){');
const searchEnd = html.indexOf('function renderWorkOrders(){',searchStart);
assert.ok(searchStart >= 0 && searchEnd > searchStart, 'S04-F10 : recherche normalisee absente');
const searchCtx = {woContactInfo(wo){return {client:{name:'Émile Tremblay',phone:'(418) 555-1234'},vehicle:{vin:'1HG-CM82633A004352',plate:'ABC-123'}};}};
vm.createContext(searchCtx);
vm.runInContext(html.slice(searchStart,searchEnd),searchCtx);
const workOrder = {number:'BT-107',clientName:'Émile Tremblay',vehicleLabel:'Mazda Miata',description:'Réparation suspension'};
for (const term of ['emile','Tremblay','4185551234','ABC123','1hgcm82633a004352','suspension','bt107','miata']) {
 assert.equal(searchCtx.woMatchesSearch(workOrder,term),true, 'Recherche invalide : '+term);
}
assert.equal(searchCtx.woMatchesSearch(workOrder,'absent99'),false);
assert.equal(searchCtx.woMatchesSearch(workOrder,''),true);
assert.ok(html.includes('Aucun bon de travail ne correspond à la recherche.'));
console.log('S04-F10 : recherche numero, client, plaque, VIN, telephone et description validee.');
