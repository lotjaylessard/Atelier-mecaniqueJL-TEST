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
