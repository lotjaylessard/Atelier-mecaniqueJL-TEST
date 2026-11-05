"use strict";
/**
 * S06-F05 : identité d'auteur préparée sans accès réseau ni stockage.
 * Ne jamais considérer un nom envoyé par le formulaire comme une preuve
 * d'identité. La transaction serveur doit dériver l'ID de auth.uid().
 * Le nom affiché est un instantané d'un profil validé pour cet ID.
 */
function confirmedActor({authenticatedUser,profile,confirmedAt}){
  const id=authenticatedUser?.id;
  if(typeof id!=="string"||!id.trim())throw new Error("Compte authentifié requis");
  if(!profile || profile.user_id!==id)
    throw new Error("Profil de cet utilisateur non vérifié");
  const name=profile.display_name;
  if(typeof name!=="string"||!name.trim()||name.trim().length>100)
    throw new Error("Nom d'affichage du compte non configuré");
  if(typeof confirmedAt!=="string"||
     !/^\d{4}-\d{2}-\d{2}T/.test(confirmedAt)||
     !Number.isFinite(Date.parse(confirmedAt)))
    throw new Error("Horodatage serveur invalide");
  return Object.freeze({
    actorId:id,actorName:name.trim(),confirmedAt
  });
}
module.exports={confirmedActor};
