"use strict";
/**
 * S06-F05/PRE : garde de validation du bon de travail dans un snapshot.
 * Defence en profondeur pour l'interface uniquement, PAS une autorisation serveur.
 * Doit etre reproduit dans une RPC securisee avec lecture du snapshot cloud.
 */
function eligibleWorkOrder(snapshot, workOrderId) {
  if (!snapshot || typeof snapshot!=="object" || Array.isArray(snapshot) ||
      !Array.isArray(snapshot.workorders) || !Array.isArray(snapshot.invoices))
    return {ok:false,reason:"Données de garage absentes ou incomplètes"};
  const matches=snapshot.workorders.filter(wo=>wo && String(wo.id)===String(workOrderId));
  if(matches.length!==1)return {ok:false,reason:"Bon de travail absent ou ambigu"};
  const wo=matches[0];
  if(wo.status!=="en_cours")return {ok:false,reason:"Bon de travail terminé ou archivé"};
  if(typeof wo.number!=="string"||!wo.number.trim())return {ok:false,reason:"Numéro de BT invalide"};
  const sameNumber=snapshot.workorders.filter(other=>other && String(other.number)===wo.number);
  if(sameNumber.length!==1)return {ok:false,reason:"Numéro de BT dupliqué"};
  if(snapshot.invoices.some(invoice=>invoice &&
    String(invoice.workOrderNumber)===wo.number))
    return {ok:false,reason:"Bon de travail déjà lié à une facture"};
  return {ok:true,workOrderId:String(wo.id),number:wo.number};
}
module.exports={eligibleWorkOrder};
