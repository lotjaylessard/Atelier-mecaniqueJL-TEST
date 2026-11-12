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

- **Test de deux requêtes concurrentes effectué en environnement isolé** : une seule transaction a réussi, la deuxième a été rejetée sur la version devenue périmée; une seule facture enregistrée. Réaliser tout de même l'essai de bout en bout via deux navigateurs authentifiés avant l'activation.
- **Pas encore de test PostgREST / RLS avec une authentification client réelle**.
- **KM saisi au moment de terminer un BT** : le serveur accepte désormais le KM final explicite fourni dans la facture et le conserve atomiquement dans le BT et le véhicule, après contrôle anti-régression. Il reste à adapter et vérifier le parcours navigateur (sans sauvegarde locale préalable).
- Vérification de compatibilité nécessaire pour les BT hérités : lecture seule sur TEST a compté 6 BT en cours, dont 1 sans `vehicleKm` stocké (aucun sans `clientId` ou `vehicleId`).
- **Après la RPC** : le navigateur devra recharger l'état serveur confirmé, ne pas effectuer d'anciennes sauvegardes locales asynchrones et traiter une réponse réseau ambiguë sans rejouer une création à l'aveugle.
- **Le bouton « Terminé » reste inchangé**. Ne pas ouvrir les permissions des RPC ni basculer le bouton tant que ces points ne sont pas résolus.

## Protection de la production

Seul Supabase TEST et le dépôt TEST ont été utilisés. Les fonctions préparatoires ne sont pas exécutables par l'application. Ce rapport n'est pas une confirmation de mise en production.

## Complément : test de concurrence réelle en sandbox isolée

Pour tester deux connexions séparées, un schéma SQL privé temporaire `s08_isolated_test_1112` a été créé dans Supabase TEST avec une table **entièrement fictive**, une copie de la RPC unifiée et un identifiant de session simulé. Aucune table métier n'a été modifiée.

Deux appels distincts à la même RPC, avec la même version attendue (7), ont été envoyés **en parallèle** :

- **Appel 1 :** réussi, version 8, facture FA-RACE-1112 créée.
- **Appel 2 :** refusé (`Garage missing or version changed`).
- Contrôle après les deux appels : **version 8, une seule facture, BT terminé, KM 1500**.
- Le schéma de test et les données fictives ont ensuite été intégralement supprimés. Confirmation SQL : `isolated_fixture_removed=true`.

Ce résultat valide la protection contre les deux demandes concurrentes au niveau du SQL. Il ne teste pas encore les déconnexions réseau du navigateur, l'exécution via PostgREST avec RLS, ni la récupération après une réponse ambiguë.

## Complément : kilométrage final atomique

Migration TEST : `s08_staged_atomic_invoice_final_km_saved_to_bt`.

- La fonction staged accepte `p_invoice.vehicleKm` comme **KM final validé**, même si `wo.vehicleKm` est absent ou ancien dans le document cloud.
- Le nouveau kilométrage est écrit à la fois dans `workorders[].vehicleKm` et dans `clients[].vehicles[].km`, avec la facture, pendant **un seul UPDATE**.
- Elle refuse les KM nuls/invalides et une valeur inférieure au dernier KM du véhicule.
- Test sur copie de la vraie fonction dans `pg_temp` : BT initial sans champ KM, véhicule 1500 km, facture à 1550 km → succès, BT 1550, véhicule 1550, 1 facture, version 5→6.
- Contre-test : tentative de 1450 km contre 1500 km → refus `Odometer decreased`.
- Essais entièrement fictifs et annulés par `ROLLBACK`, sans changement aux dossiers existants.

**À faire :** passage client JS sur le nouvel appel atomique, après vérification Chrome et RLS authentifié. Le bouton existant reste inchangé.
