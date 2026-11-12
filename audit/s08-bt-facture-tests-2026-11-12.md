# Audit S08 — BT → facture : tests isolés du 12 novembre 2026

**Dépôt :** lotjaylessard/Atelier-mecaniqueJL-TEST  
**Branche :** s08/soumissions  
**Projet Supabase :** Atelier-mecaniqueJL-TEST uniquement  
**Fonction préparatoire :** `public.s08_finalize_bt_invoice_unified_staged`  
**Statut :** NON ACTIVÉE dans le navigateur; fonctions d'écriture interdites à `authenticated` et `anon`.

## Méthode des tests

Chaque test a utilisé une **copie SQL de la définition réelle** de la RPC unifiée, renommée `pg_temp.*` et ciblant une **table temporaire `pg_temp.garage_data` contenant seulement des clients, véhicules, BT et factures fictifs**. L'identité simulée était injectée dans la transaction SQL; toutes les expériences étaient encadrées par `BEGIN ... ROLLBACK`.

**Aucune ligne de `public.garage_data`, aucun compte Auth ni aucune facture du garage n'a été créé ou modifié dans ces essais.** Ces tests exercent le corps SQL (y compris son `UPDATE` atomique) mais ne constituent **pas** une validation complète des droits RLS et du comportement PostgREST d'une session cliente réelle.

## Résultats réussis

1. Simulation `dry_run=true` : pas d'écriture, version inchangée.
2. Simulation `dry_run=null` : pas d'écriture, version inchangée.
3. Facture valide : création d'**une seule** facture, BT passé de `en_cours` à `termine`, kilométrage fictif mis à jour dans **une seule transaction**, version incrémentée de 7 à 8.
4. Deuxième tentative sur la version périmée : refus, sans doublon.
5. Pièce : total de ligne modifié : rejet.
6. Main-d'œuvre : total de ligne modifié : rejet.
7. TPS modifiée sans réconcilier le total : rejet.
8. TPS modifiée avec total réconcilié artificiellement : rejet selon le taux du garage.
9. Rabais inattendu à la création : rejet.
10. Numéro de BT différent dans la facture : rejet.
11. Identifiant de facture `null` : rejet.
12. Version cloud attendue incorrecte : rejet.
13. Facture déjà marquée payée : rejet.
14. Kilométrage facture différent du BT : rejet.
15. Identifiant interne de facture déjà utilisé ailleurs : rejet.
16. Numéro de BT dupliqué : rejet.
17. Facture minuteur fictive : montant exact confirmé conservé même différent de `heures × tarif`; création réussie.
18. Minuteur : `confirmedMs` altéré : rejet.
19. Minuteur : `timerSessionId` altéré : rejet.
20. BT sans `clientId` : rejet après ajout d'un contrôle serveur.
21. BT sans `vehicleKm` : rejet après ajout d'un contrôle serveur.

Tous les scénarios ont utilisé des données fictives. Les requêtes SQL ont confirmé les résultats attendus, puis les transactions ont été annulées (`ROLLBACK`).

## Correction serveur supplémentaire

Migration TEST : `s08_stage_require_linked_client_vehicle_and_km` sur la fonction préparatoire unifiée.

Ajouts : refuser le BT si son client/véhicule lié manque, refuser un kilométrage absent, nul ou non numérique, refuser un client ou véhicule lié devenu introuvable plutôt que d'ignorer silencieusement la mise à jour du kilométrage.

Une nouvelle simulation fictive après cette migration a vérifié la réussite normale, puis le rejet du client manquant et du KM manquant. Permissions `EXECUTE` vérifiées : `authenticated=false` et `anon=false` pour les trois RPC préparatoires.

## Points bloquants avant activation

- **Pas encore de test de deux connexions simultanées** contre un même enregistrement réellement partagé : le test de second appel ci-dessus valide le *rejeu séquentiel*, pas une vraie course entre deux transactions.
- **Pas encore de test PostgREST / RLS avec une authentification client réelle**.
- **KM saisi au moment de terminer un BT** : le navigateur peut actuellement utiliser une nouvelle valeur locale alors que la fonction unifiée compare la facture au KM persisté du BT. Il faut concevoir le passage et la vérification du kilométrage final dans la même transaction, ou forcer une sauvegarde cloud préalable, sans créer de conflit.
- Vérification de compatibilité nécessaire pour les BT hérités : lecture seule sur TEST a compté 6 BT en cours, dont 1 sans `vehicleKm` stocké (aucun sans `clientId` ou `vehicleId`).
- **Après la RPC** : le navigateur devra recharger l'état serveur confirmé, ne pas effectuer d'anciennes sauvegardes locales asynchrones et traiter une réponse réseau ambiguë sans rejouer une création à l'aveugle.
- **Le bouton « Terminé » reste inchangé**. Ne pas ouvrir les permissions des RPC ni basculer le bouton tant que ces points ne sont pas résolus.

## Protection de la production

Seul Supabase TEST et le dépôt TEST ont été utilisés. Les fonctions préparatoires ne sont pas exécutables par l'application. Ce rapport n'est pas une confirmation de mise en production.
