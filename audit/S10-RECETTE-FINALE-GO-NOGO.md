# S10 — Décision de migration accélérée (TEST seulement)

Date : 2026-11-22. Statut : **NON AUTORISÉ À MIGRER** jusqu'à validation des critères bloquants.

## Contrôles confirmés à ce jour
- [x] RLS activé sur public.garage_data, public.garage_members et public.garage_quotes (interrogation Supabase TEST).
- [x] Policies SELECT/UPDATE garage_data; SELECT membership; SELECT/UPDATE same-garage et INSERT/DELETE auteur garage_quotes (inventaire Supabase TEST).
- [x] Simulations SQL antérieures : isolation owner A / owner B, lecture et mise à jour même garage, contrôle de version conditionnel.
- [x] GitHub TEST : garde lecture seule des soumissions collègues, rafraîchissement concurrent protégé, fermeture de fiche obsolète.
- [x] Audit antérieur : références de pièces jointes et inventaires de production en lecture seule.
- [ ] **Pas encore vérifié en navigateur** avec deux vrais comptes et leurs sessions.

## Bloquants réels, groupés en une seule recette
1. **Identités et séparation** : propriétaire A, employé A, propriétaire B ; ouverture de session, appartenance au bon garage, accès autorisé au même garage, refus intergarage. Inclure déconnexion/reconnexion.
2. **Cycle métier** : créer soumission, approuver/planifier, convertir en BT, minuterie et main-d'œuvre, pièces, facture et paiement. Vérifier que les changements sont visibles par l'employé autorisé et interdits au garage B.
3. **Calendriers et fichiers** : rendez-vous, annulation/replanification, pièces jointes BT et Storage privé, consultation depuis le compte collègue ; absence de fuite intergarage.
4. **Sauvegarde/restauration** : export physique complet et vérification des empreintes, restauration dans environnement isolé, comptages, paiements, liens véhicules et pièces jointes. Cette étape attend un navigateur sur ordinateur.

## Conditions avant production
- [ ] Recette navigateur des 4 groupes ci-dessus sans anomalie bloquante.
- [ ] Sauvegarde PROD vérifiée, restauration de test et plan de retour arrière validés.
- [ ] Plan de migration de l'ami : identité, garage, rôles, données et pièces jointes, puis rapprochement des comptages.
- [ ] Autorisation explicite du propriétaire avant toute écriture PROD.

## Non bloquants reportés
- Raffinement des couleurs Outlook, optimisations cosmétiques, micro-ajustements UI et synchronisation temps réel.
- Les anomalies non critiques sont consignées après lancement, pas utilisées pour retarder indéfiniment.

## Principe de progression
Ne plus annoncer de pourcentage pseudo-précis. Communiquer uniquement les **critères validés / bloquants restants**. Le chiffre historique de 89 % n'est pas une mesure de recette.

## Périmètre
Supabase TEST : nraijzsodgojkpyigefu.
GitHub TEST : lotjaylessard/Atelier-mecaniqueJL-TEST, branche integration-finale.
PROD : aucune modification autorisée par ce document.

## Contrôle SQL supplémentaire — 2026-11-22 (lecture seule)
- [x] `garage_quotes` : 14 lignes; 0 auteur sans membership dans le garage; 0 numéro vide; 0 version NULL.
- [x] `garage_members` : 3 lignes; 0 `garage_id` NULL.
- [x] `garage_data` : 3 lignes; 1 ligne héritée avec `garage_id` NULL; 0 enregistrement rattaché à un garage sans membership du propriétaire.
- [ ] Identifier le statut de la ligne `garage_data` sans garage avant de décider d'un traitement; ne pas la supprimer automatiquement.
- [ ] Les contrôles SQL de cohérence ne remplacent pas la recette réelle multi-comptes.
- [ ] Production inchangée.

## Qualification de la ligne historique sans garage — 2026-11-22
- [x] Ligne `garage_data.garage_id IS NULL` examinée en lecture seule : `version=0`, `updated_at=2026-10-25 18:40:33 UTC`, JSON objet de 7 clés.
- [x] L'utilisateur associé a 1 membership garage; aucune soumission `garage_quotes` avec cet auteur.
- [x] La ligne reste intacte. Ne pas l'attribuer automatiquement à un garage ni la supprimer.
- [ ] Avant migration de cette ligne, comparer son contenu avec les sauvegardes et identifier son rôle historique.
- [ ] Recette navigateur et restauration physique demeurent les vrais critères bloquants.

## Matrice d'accès RLS simulée — 2026-11-22
Tests séparés avec `SET LOCAL ROLE authenticated`, claim JWT `sub` simulé et `ROLLBACK`; aucune écriture persistante.

| Identité simulée | garage_data visibles | garage_quotes visibles | memberships visibles |
|---|---:|---:|---:|
| Propriétaire A | 1 | 14 | 1 |
| Employé A | 1 | 14 | 1 |
| Propriétaire B | 1 | 0 | 1 |

- [x] Propriétaire et employé du garage A lisent les mêmes 14 soumissions.
- [x] Propriétaire du garage B ne lit aucune soumission du garage A.
- [x] Chacun voit une seule ligne de données garage et sa propre appartenance.
- [ ] **Non couvert** : véritables sessions navigateur, écritures métier complètes, pièces jointes et sauvegarde/restauration.
- [ ] Aucun déploiement production.

## Contrôle UPDATE RLS intergarage — 2026-11-22
- [x] Employé A, JWT simulé : `UPDATE garage_quotes SET version=version+1 WHERE id=... AND version=6 RETURNING...` a renvoyé 1 ligne (version 7), transaction annulée.
- [x] Propriétaire B, JWT simulé : même `UPDATE` a renvoyé 0 ligne, transaction annulée.
- [x] La version de la ligne témoin reste à 6 après `ROLLBACK`.
- [ ] Le test ne valide pas les actions métier complètes dans l'interface ni les autres champs d'écriture.
