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

const sortStart = html.indexOf('let WO_SORT_KEY = null;');
const sortEnd = html.indexOf('function renderWorkOrders(){',sortStart);
assert.ok(sortStart>=0 && sortEnd>sortStart,'S04-F11 : fonctions de tri absentes');
const sortCtx={
 CLIENTS:[{id:1,firstName:'Zoé',lastName:'Benoit'},{id:2,firstName:'Émile',lastName:'Arsenault'}],
 woDisplayKm:wo=>({value:wo.vehicleKm ?? null}),
 renderWorkOrders(){}
};
vm.createContext(sortCtx);
vm.runInContext(html.slice(sortStart,sortEnd),sortCtx);
const wos=[
 {number:'BT-9',date:'2026-10-01',status:'termine',clientId:1,vehicleLabel:'Mazda',vehicleKm:10000,estimateTotal:100},
 {number:'BT-10',date:'2026-11-01',status:'en_cours',clientId:2,vehicleLabel:'Toyota',vehicleKm:50000,estimateTotal:250},
 {number:'BT-2',date:'2026-09-01',status:'en_cours',clientId:1,vehicleLabel:'Honda',vehicleKm:null,estimateTotal:50}
];
assert.deepEqual(Array.from(sortCtx.sortWorkOrderRows(wos),w=>w.number),['BT-10','BT-2','BT-9']);
sortCtx.setWorkOrderSort('number');
assert.deepEqual(Array.from(sortCtx.sortWorkOrderRows(wos),w=>w.number),['BT-10','BT-9','BT-2']);
sortCtx.setWorkOrderSort('number');
assert.deepEqual(Array.from(sortCtx.sortWorkOrderRows(wos),w=>w.number),['BT-2','BT-9','BT-10']);
sortCtx.setWorkOrderSort('km');
assert.deepEqual(Array.from(sortCtx.sortWorkOrderRows(wos),w=>w.number),['BT-10','BT-9','BT-2']);
sortCtx.setWorkOrderSort('km');
assert.deepEqual(Array.from(sortCtx.sortWorkOrderRows(wos),w=>w.number),['BT-9','BT-10','BT-2']);
sortCtx.setWorkOrderSort('client');
assert.equal(sortCtx.sortWorkOrderRows(wos)[0].number,'BT-10');
sortCtx.setWorkOrderSort('total');
assert.deepEqual(Array.from(sortCtx.sortWorkOrderRows(wos),w=>w.number),['BT-10','BT-9','BT-2']);
sortCtx.setWorkOrderSort('date');
assert.deepEqual(Array.from(sortCtx.sortWorkOrderRows(wos),w=>w.number),['BT-10','BT-9','BT-2']);
for (const key of ['number','date','client','vehicle','km','description','status','total']){
 assert.ok(html.includes('data-wo-sort="'+key+'"'), 'Entete tri manquant : '+key);
}
console.log('S04-F11 : tri 8 colonnes, sens inverses et KM absents verifies.');

const actionListStart = html.indexOf('function renderWorkOrders(){');
const actionListEnd = html.indexOf('function finishWorkOrder(id){', actionListStart);
assert.ok(actionListStart > 0 && actionListEnd > actionListStart, 'S04-F12 liste BT absente');
const actionMarkup = html.slice(actionListStart,actionListEnd);
assert.ok(actionMarkup.includes('wo.status === "en_cours" && !invoice'), 'S04-F12 actions ouvertes aux BT termines ou factures');
assert.ok(!actionMarkup.includes('wo.status !== "termine"'), 'S04-F12 ancienne condition de fin de BT conservee');
function actionVisible(wo,invoice){return wo.status==="en_cours" && !invoice;}
assert.equal(actionVisible({status:"en_cours"},null),true);
for(const status of ["termine","billed"]) assert.equal(actionVisible({status},null),false);
assert.equal(actionVisible({status:"en_cours"},{status:"partial"}),false);
assert.equal(actionVisible({status:"en_cours"},{status:"paid"}),false);
console.log('S04-F12 : boutons Terminer/Supprimer masques pour BT termines ou factures.');

const detailStart = html.indexOf('function initWorkOrdersModule(){');
const detailEnd = html.indexOf('// ===== TIMER MAIN-D',detailStart);
assert.ok(detailStart >= 0 && detailEnd > detailStart,'S04-F13 : module de detail absent');
const detailSource = html.slice(detailStart,detailEnd);
assert.ok(detailSource.includes('const woReadOnly = wo.status !== "en_cours" || Boolean(invoice);'), 'S04-F13 : statut lecture seule absent');
assert.ok(detailSource.includes('woReadOnly\n      ?'), 'S04-F13 : boutons non conditionnels');
assert.ok(html.includes('function applyClosedWOControls(wo,detail)'), 'S04-F14 : permissions detail absentes');
assert.ok(html.includes('el.disabled = !(allowedNote || (isEditing && financialField));'), 'S04-F14 : notes ou formulaires de correction non proteges');
assert.ok(html.includes('button.textContent.includes("Copier")'), 'S04-F14 : bouton copier VIN absent');
assert.ok(detailSource.includes('if (woReadOnly) return;\n    syncKmEverywhereFromWO'), 'S04-F14 : KM modifiable apres cloture');
assert.ok(detailSource.includes('if (!woCanEditNotes(wo)) return;'), 'S04-F14 : garde notes absente');
assert.ok(detailSource.includes('beginClosedWOEdit'), 'S04-F14 : bouton mode correction absent');
assert.ok(detailSource.includes('endClosedWOEdit'), 'S04-F14 : sortie de correction absente');
console.log('S04-F13 : BT termines/factures en lecture seule, controles de modification masques.');

const f14Start = html.indexOf('window.__woClosedEditId = null;');
const f14End = html.indexOf('function persistActiveWO(wo){',f14Start);
assert.ok(f14Start > 0 && f14End > f14Start, 'S04-F14 : mecanisme de synchronisation absent');
const f14code=html.slice(f14Start,f14End);
function buildF14(invoices) {
 const snapshot={};
 const ctx={
  window:{}, INVOICES:invoices,WORKORDERS:[],
  CLOUD_DATA_READY:true,CLOUD_SYNC_FAILED:false,
  STORAGE:{workorders:'wo',invoices:'inv'},
  localStorage:{setItem(k,v){snapshot[k]=JSON.parse(v);}},
  SETTINGS:{gst:5,qst:9.975},
  recalcInvoice(inv){
    const sub=inv.items.reduce((v,x)=>v+x.qty*x.rate,0);
    const discount=inv.discountType==='percent' ? sub*Number(inv.discountValue||0)/100 : Number(inv.discountValue||0);
    const taxable=Math.max(0,sub-discount);
    inv.subTotal=sub;inv.discount=discount;
    inv.gst=inv.applyGST===false?0:taxable*0.05;
    inv.qst=inv.applyQST===false?0:taxable*0.09975;
    inv.total=taxable+inv.gst+inv.qst;
  },
  scheduleCloudSync(){ctx.synced=(ctx.synced||0)+1;},
  renderInvoiceList(){}
 };
 vm.createContext(ctx);
 vm.runInContext(f14code,ctx);
 const uiStart = html.indexOf('function applyClosedWOControls(wo,detail){');
 const uiEnd = html.indexOf('function beginClosedWOEdit(woId){',uiStart);
 assert.ok(uiStart > 0 && uiEnd > uiStart,'S04-F14 : fonction de controle des champs absente');
 vm.runInContext(html.slice(uiStart,uiEnd),ctx);
 return {ctx,snapshot};
}
const closedWO={id:77,number:'BT-77',status:'termine',
  parts:[{name:'Filtre',qty:2,rate:25,cost:8}],
  labor:[{description:'Pose filtre',hours:1,rate:80}]};
const originalInvoice={number:'FA-77',workOrderNumber:'BT-77',status:'unpaid',
 paidAmount:0,payments:[],discountValue:10,discountType:'percent',
 applyGST:false,applyQST:true,items:[{desc:'Avant',qty:1,rate:50}]};
const scenario=buildF14([structuredClone(originalInvoice)]);
scenario.ctx.WORKORDERS.push(closedWO);
assert.equal(scenario.ctx.woCanEditFinancials(closedWO),false);
scenario.ctx.window.__woClosedEditId='77';
assert.equal(scenario.ctx.woCanEditFinancials(closedWO),true);
assert.equal(scenario.ctx.woInvoiceMatchesWO(closedWO,{items:[
 {type:'Pièce',desc:'Filtre',qty:2,rate:25},
 {type:"Main-d'œuvre",desc:'Pose filtre',qty:1,rate:80}
]}),true);
assert.equal(scenario.ctx.woInvoiceMatchesWO(closedWO,{items:[
 {type:'Pièce',desc:'Filtre',qty:3,rate:25},
 {type:"Main-d'œuvre",desc:'Pose filtre',qty:1,rate:80}
]}),false);
assert.equal(scenario.ctx.woSyncUnpaidInvoice(closedWO),true);
assert.equal(scenario.ctx.synced,1);
assert.equal(scenario.ctx.INVOICES[0].items.length,2);
assert.equal(scenario.ctx.INVOICES[0].subTotal,130);
assert.equal(scenario.ctx.INVOICES[0].total,130*0.9*1.09975);
assert.equal(scenario.ctx.INVOICES[0].paidAmount,0);
assert.equal(scenario.ctx.INVOICES[0].applyGST,false);
assert.equal(scenario.snapshot.wo[0].number,'BT-77');
assert.equal(scenario.snapshot.inv[0].items.length,2);
for(const status of ['partial','paid']) {
 const locked=buildF14([{...structuredClone(originalInvoice),status,paidAmount:status==='partial'?20:130,
 payments:[{amount:status==='partial'?20:130}]}]);
 locked.ctx.window.__woClosedEditId='77';
 assert.equal(locked.ctx.woCanEditFinancials(closedWO),false);
 assert.equal(locked.ctx.woSyncUnpaidInvoice(closedWO),false);
 assert.equal(locked.ctx.synced,undefined);
 assert.equal(locked.ctx.woCanEditNotes(closedWO),status==='partial');
}
const irregular=buildF14([{...structuredClone(originalInvoice),payments:[{amount:1}]}]);
irregular.ctx.window.__woClosedEditId='77';
assert.equal(irregular.ctx.woCanEditFinancials(closedWO),false);
assert.equal(irregular.ctx.woSyncUnpaidInvoice(closedWO),false);
assert.equal(buildF14([]).ctx.woCanEditNotes(closedWO),false);
assert.ok(html.includes('if (!woRequireFinancialEdit(wo)) return;'));
assert.ok(html.includes('persistActiveWO(wo);\nwoRenderLines(wo);'));
console.log('S04-F14 : mode correction impaye, facture et paiements preserves, verrouillage partiel/paye verifies.');

// L'autorisation d'ouvrir le mode correction exige une facture encore identique au BT.
assert.ok(html.includes('if (!woInvoiceMatchesWO(wo,woLinkedInvoice(wo)))'), 'S04-F14 : protection anti-ecrasement facture absente');
assert.ok(html.includes('if (button.textContent.includes("Terminé")'), 'S04-F14 : boutons de cloture non bloques');
console.log('S04-F14 : lignes facture independamment modifiees detectees sans ecrasement.');

function verifyF14FormPermissions(invoiceStatus,editActive){
 const invoice={...structuredClone(originalInvoice),status:invoiceStatus};
 const {ctx}=buildF14([invoice]);
 const wo={...closedWO};
 if(editActive) ctx.window.__woClosedEditId=String(wo.id);
 const makeField=(id,section)=>({id,disabled:false,closest(sel){
   return section && sel.includes(section) ? {} : null;
 }});
 const fields=[
   makeField('woManualPartName','#woManualPartBox'),
   makeField('woManualPartQty','#woManualPartBox'),
   makeField('woManualPartCost','#woManualPartBox'),
   makeField('woManualPartRate','#woManualPartBox'),
   makeField('woManualLaborDesc','#woManualLaborBox'),
   makeField('woManualLaborHours','#woManualLaborBox'),
   makeField('woManualLaborRate','#woManualLaborBox'),
   makeField('woNotes'),
   makeField('woKmInput'),
   makeField('woFileInput'),
   makeField('woDescriptionEdit')
 ];
 const editButton={style:{},textContent:'Modifier le BT'};
 const finishButton={style:{},textContent:'Fin des modifications'};
 const detail={
   querySelectorAll(selector){
     if(selector.startsWith('input:'))return fields;
     if(selector==='button')return [editButton,finishButton];
     return [];
   },
   querySelector(selector){
     if(selector==='#woEditClosedBtn')return editButton;
     if(selector==='#woFinishClosedEditBtn')return finishButton;
     if(selector==='#woClosedEditStatus')return {textContent:''};
     return null;
   }
 };
 ctx.applyClosedWOControls(wo,detail);
 return {fields,editButton,finishButton};
}
const readonlyF14=verifyF14FormPermissions('unpaid',false);
assert.ok(readonlyF14.fields.slice(0,7).every(f=>f.disabled),'Formulaires actifs sans mode correction');
assert.equal(readonlyF14.fields[7].disabled,false,'Notes doivent rester modifiables');
const editableF14=verifyF14FormPermissions('unpaid',true);
assert.ok(editableF14.fields.slice(0,7).every(f=>!f.disabled),'S04-F14 : champs pieces/services encore desactives');
assert.ok(editableF14.fields.slice(8).every(f=>f.disabled),'KM, fichiers et description doivent rester verrouilles');
assert.equal(editableF14.editButton.style.display,'none');
assert.equal(editableF14.finishButton.style.display,'');
const partialF14=verifyF14FormPermissions('partial',true);
assert.ok(partialF14.fields.slice(0,7).every(f=>f.disabled),'Facture partielle : modification financiere interdite');
assert.equal(partialF14.fields[7].disabled,false,'Facture partielle : notes permises');
const paidF14=verifyF14FormPermissions('paid',true);
assert.ok(paidF14.fields.every(f=>f.disabled),'Facture payee : champs verrouilles');
console.log('S04-F14-Fix : formulaire manuel pieces/services editable uniquement en mode correction impayee.');

const navigationStart = html.indexOf('function returnToWOListFromDetail(){');
const navigationEnd = html.indexOf('function saveInvoiceFromWO(){',navigationStart);
assert.ok(navigationStart >= 0 && navigationEnd > navigationStart,
  'S04-F14 : fonction de retour BT introuvable');
const navigationFunction = html.slice(navigationStart,navigationEnd);
assert.ok(!navigationFunction.includes('persistActiveWO('),
  'S04-F14 : navigation ne doit pas modifier la facture');
{
 const detail={style:{display:'block'}};
 const list={style:{display:'none'}};
 const ctx={
   window:{__woClosedEditId:'77'},
   $(id){return id==='woDetailCard'?detail:id==='woListCard'?list:null;},
   initWorkOrdersModule(){ctx.rendered=(ctx.rendered||0)+1;},
   persistActiveWO(){throw new Error('La navigation ne doit pas sauvegarder!');}
 };
 vm.createContext(ctx);
 vm.runInContext(navigationFunction,ctx);
 ctx.returnToWOListFromDetail();
 assert.equal(detail.style.display,'none');
 assert.equal(list.style.display,'block');
 assert.equal(ctx.window.__woClosedEditId,null);
 assert.equal(ctx.rendered,1);
 ctx.returnToWOListFromDetail();
 assert.equal(ctx.rendered,1,'La navigation deja fermee ne doit pas relancer la liste');
}
console.log('S04-F14 : retour a la liste sans sauvegarde, alerte ni recalcul de facture.');

/* S04 audit final : cycle complet BT -> facture -> partiel -> solde -> archive.
   Fonctions de production executees avec environnement local simule, sans Supabase. */
function extractLifecycleFunction(begin,end) {
 const a=html.indexOf(begin), b=html.indexOf(end,a+begin.length);
 assert.ok(a>=0 && b>a,"Fonction introuvable pour audit : "+begin);
 return html.slice(a,b);
}
const lifecycleCode=[
 extractLifecycleFunction('function finishWorkOrder(id){','async function deleteWorkOrder(id)'),
 extractLifecycleFunction('function markInvoicePartial(number, method){','if ($("vehicleSearch"))'),
 extractLifecycleFunction('function payInvoiceWithMethod(number, method){','/* ===================== WORK ORDERS (Bons de travail)'),
 extractLifecycleFunction('function archiveInvoice(number){','function invoicePaymentMethodLabel(method)')
].join('\n');
function runLifecycleScenario() {
 const logs={alerts:[],confirmations:0,cloudSaves:0,viewedInvoices:[],storedInvoices:[],storedWOs:[]};
 const wo={id:8801,number:'BT-AUDIT-8801',status:'en_cours',vehicleKm:45000,
   clientName:'CLIENT AUDIT',vehicleLabel:'2022 Mazda Mazda3',
   parts:[{name:'Filtre',qty:1,rate:25,cost:10}],
   labor:[{description:'Installation',hours:1,rate:75}],estimateTotal:100};
 const clients=[{name:'CLIENT AUDIT',vehicles:[{year:2022,make:'Mazda',model:'Mazda3',km:44000}]}];
 const ctx={
   WORKORDERS:[wo],INVOICES:[],CLIENTS:clients,
   SETTINGS:{gst:5,qst:9.975},
   recalcInvoice(inv){
     const subtotal=(inv.items||[]).reduce((sum,it)=>sum+Number(it.qty)*Number(it.rate),0);
     const discount=inv.discountType==="percent"
       ? subtotal*Number(inv.discountValue||0)/100
       : Number(inv.discountValue||0);
     const taxable=Math.max(0,subtotal-discount);
     inv.subTotal=subtotal;
     inv.discount=discount;
     inv.taxableSubTotal=taxable;
     inv.gst=inv.applyGST===false?0:taxable*0.05;
     inv.qst=inv.applyQST===false?0:taxable*0.09975;
     inv.total=taxable+inv.gst+inv.qst;
   },
   document:{getElementById(){return null;}},
   loadWorkOrders(){},loadInvoices(){},
   saveWorkOrders(){logs.storedWOs.push(structuredClone(ctx.WORKORDERS));logs.cloudSaves++;},
   saveInvoices(){logs.storedInvoices.push(structuredClone(ctx.INVOICES));logs.cloudSaves++;},
   saveClients(){logs.cloudSaves++;},
   renderWorkOrders(){},renderInvoiceList(){},renderDashboard(){},renderHistoryTable(){},
   showPage(){},openInvoiceEditModal(n){logs.viewedInvoices.push(n);},
   btToInvoiceNumber(n){return n.replace(/^BT/,'FA');},
   money(n){return Number(n).toFixed(2);},
   confirm(){logs.confirmations++;return true;},
   prompt(){return '30.00';},
   alert(msg){logs.alerts.push(msg);}
 };
 vm.createContext(ctx);
 vm.runInContext(lifecycleCode,ctx);
 ctx.finishWorkOrder(wo.id);
 assert.equal(wo.status,'termine','La cloture doit changer le statut');
 assert.equal(ctx.INVOICES.length,1,'Un seul document facture doit etre cree');
 const inv=ctx.INVOICES[0];
 assert.equal(inv.number,'FA-AUDIT-8801');
 assert.equal(inv.workOrderNumber,wo.number);
 assert.equal(inv.status,'unpaid');
 assert.equal(inv.items.length,2);
 assert.equal(inv.subTotal,100);
 assert.ok(Math.abs(inv.total-114.975)<0.00001);
 assert.ok(Math.abs(inv.qst-9.975)<0.00001,'TVQ calculee sur base taxable et non TPS incluse');
 ctx.finishWorkOrder(wo.id);
 assert.equal(ctx.INVOICES.length,1,'Le second clic ne doit pas doubler la facture');
 assert.equal(logs.confirmations,1,'Le second clic ne doit pas demander une nouvelle cloture');
 ctx.markInvoicePartial(inv.number,'cash');
 assert.equal(inv.status,'partial');
 assert.equal(inv.paidAmount,30);
 assert.equal(inv.payments.length,1);
 assert.equal(inv.payments[0].method,'cash');
 ctx.payInvoiceWithMethod(inv.number,'transfer');
 assert.equal(inv.status,'paid');
 assert.equal(Math.round(inv.paidAmount*100),Math.round(inv.total*100), 'Le paiement doit solder le total arrondi au cent');
 assert.equal(inv.payments.length,2);
 assert.equal(inv.payments[1].method,'transfer');
 assert.ok(Math.abs(inv.payments[1].amount-(Math.round(inv.total*100)-3000)/100)<0.01);
 ctx.payInvoiceWithMethod(inv.number,'card');
 assert.equal(inv.payments.length,2,'Aucun paiement supplementaire sur facture payee');
 ctx.archiveInvoice(inv.number);
 assert.equal(inv.archived,true,'La facture payee peut etre archivee');
 assert.equal(wo.status,'termine','L archivage ne doit pas rouvrir le BT');
 assert.equal(ctx.INVOICES.length,1,'Le cycle doit garder une facture unique');
 return logs;
}
const lifecycleAudit=runLifecycleScenario();
assert.ok(lifecycleAudit.storedInvoices.length>=3,'Sauvegarde des stades facture absente');
console.log('S04-AUDIT : cloture, facture unique, paiement partiel, solde, protection et archivage verifies.');
