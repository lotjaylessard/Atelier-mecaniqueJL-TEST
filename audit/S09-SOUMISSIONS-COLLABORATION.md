# S09 — Soumissions et collaboration multigarage (audit TEST)

Date : 2026-11-22. Périmètre : branche `integration-finale`, Supabase TEST uniquement.

## Constat vérifié
- `public.garage_quotes` : politiques RLS SELECT/INSERT/UPDATE/DELETE limitées à `user_id=auth.uid()` avec appartenance au garage.
- `index.html` : plusieurs lectures et mises à jour de `garage_quotes` ajoutent explicitement `.eq("user_id", auth.user.id)`, en plus de `.eq("garage_id", ACTIVE_GARAGE_ID)`.
- La RPC `backup_garage_quotes` est volontairement réservée au propriétaire pour sauvegarder toutes les soumissions. Elle n'est **pas** une API de collaboration.
- Les notes de calendrier et les sessions de minuteur ont aussi des règles liées à l'auteur, mais leur confidentialité/appropriation peut être intentionnelle.

## Conséquence
Un propriétaire ne voit pas nécessairement les soumissions créées par son employé; un employé ne voit pas celles de son collègue. Modifier seulement la RLS ne suffira pas : les filtres frontend resteront restrictifs.

## Plan de correction — non appliqué
1. Définir explicitement la règle métier : soumissions partagées par garage, avec attribution de l'auteur conservée et journalisation des modifications.
2. Modifier **sur TEST seulement** les politiques SELECT et, si approuvé, UPDATE de `garage_quotes` pour les membres du même garage; conserver INSERT avec auteur = utilisateur authentifié et interdire le changement de `garage_id`/`user_id`.
3. Évaluer les droits DELETE : préférer archivage/annulation plutôt que suppression ouverte à tous les employés.
4. Corriger **toutes** les requêtes du frontend qui filtrent les soumissions par auteur (listes, calendrier, conversion, édition, historique et synchronisation).
5. Tester propriétaire A / employé A / propriétaire B, concurrence des versions, changement d'auteur, et cloisonnement strict entre garages.
6. Ne déployer qu'après test de bout en bout et sauvegarde vérifiée.

## Statut
- [x] Risque identifié par inspection des politiques RLS TEST et du frontend TEST.
- [x] Plan d'action documenté.
- [ ] Changement RLS et frontend non effectué : nécessite modification coordonnée et tests.
- [ ] Aucune modification en production.

## Mise à jour : lecture partagée TEST
- [x] Migration Supabase TEST `s09_quotes_shared_read_only_test` : SELECT de `garage_quotes` autorisé pour propriétaire/employé du même garage.
- [x] Tests SQL simulant JWT : propriétaire A = 14 soumissions du garage A; employé A = 14; propriétaire B = aucune du garage A.
- [ ] Le frontend filtre toujours par `user_id` dans plusieurs requêtes : **lecture partagée non encore fonctionnelle dans l'interface**.
- [ ] UPDATE/DELETE demeurent limités à l'auteur; règles de collaboration non finalisées.
- [ ] Aucun changement en production.

## Mise à jour : requêtes de calendrier TEST
- [x] Trois requêtes de lecture des soumissions du calendrier / rendez-vous / détection de conflits ne filtrent plus par `user_id` et restent bornées par `ACTIVE_GARAGE_ID`.
- [x] Commit frontend TEST `195b9303`.
- [ ] Autres écrans de soumissions, historique, conversion et modifications demeurent liés à l'auteur : ne pas annoncer la collaboration complète.
- [ ] Validation navigateur avec deux utilisateurs du même garage à effectuer ultérieurement.

## Mise à jour : historique TEST
- [x] Lecture de l'historique `declined/expired` sans filtre d'auteur, avec `garage_id=ACTIVE_GARAGE_ID`.
- [x] Ouverture d'une soumission historique par ID sans filtre d'auteur, avec `garage_id=garageId`.
- [x] Commit frontend TEST `d813dc78`.
- [ ] Liste principale et édition toujours limitées à l'auteur; ne pas annoncer le partage complet.
- [ ] Tests navigateur multiutilisateur à réaliser.

## Mise à jour : identité immuable des soumissions TEST
- [x] Migration `s09_protect_quote_identity_test` : trigger BEFORE UPDATE refuse les changements de `id`, `garage_id`, `user_id`, `created_at` et `quote_number`.
- [x] Essais SQL en transaction annulée : UPDATE sans changement d'identité accepté; tentative de changement de `user_id` rejetée avec SQLSTATE 23514.
- [ ] Le frontend de la liste principale reste limité à l'auteur. Partage complet et tests navigateur en attente.
- [ ] Production inchangée.

## Mise à jour : liste principale partagée TEST
- [x] La liste principale et son rechargement après expiration lisent les SO de tout le garage actif, avec `user_id` de chaque créateur.
- [x] Les SO des collègues sont visibles dans le tableau, mais l'ouverture de leur fiche depuis cette liste est temporairement désactivée (actions non encore sécurisées).
- [x] L'expiration automatique ne tente plus de modifier les SO des autres auteurs.
- [x] Commits frontend TEST `86e08ecc` et `e39e48f8`.
- [ ] Validation navigateur et collaboration d'édition encore en attente.

## Mise à jour : test de soumission créée par un employé
- [x] Transaction SQL TEST : création d'une SO par employé A (avec `clientName` requis par trigger de numérotation).
- [x] Assertions SQL : propriétaire A lit exactement 1 SO créée par employé A; propriétaire B lit 0.
- [x] Transaction annulée : aucune SO de test conservée.
- [ ] Pas de test JWT navigateur réel ni de validation du workflow de modification.
- [ ] Production inchangée.

## Mise à jour : UPDATE entre collègues TEST
- [x] Migration `s09_quotes_same_garage_update_test` : UPDATE autorisé aux membres owner/employee du garage de la soumission; SELECT déjà partagé.
- [x] Trigger immutabilité S09 toujours actif pour `id`, `garage_id`, `user_id`, `created_at`, `quote_number`.
- [x] Test SQL avec soumission fictive d'employé A : propriétaire A modifie 1 ligne; propriétaire B modifie 0 ligne; transaction annulée.
- [ ] Frontend : filtres `user_id` et garde-fous de consultation/édition des collègues restent à adapter avant utilisation.
- [ ] DELETE reste limité au créateur. Test navigateur et contrôle de concurrence de bout en bout en attente.
- [ ] Production inchangée.

## Mise à jour : concurrence inter-auteurs TEST
- [x] Transaction SQL simulée : employé A crée une soumission; propriétaire A réussit un UPDATE conditionnel sur `version`; deuxième UPDATE avec ancienne version affecte 0 ligne.
- [x] La première modification demeure inchangée; transaction annulée.
- [ ] Ce test confirme la stratégie UPDATE conditionnelle, pas une contrainte globale de version imposée à toutes les écritures.
- [ ] Frontend : détails/édition inter-employés encore désactivés dans la liste principale; validation navigateur à faire.
- [ ] Production inchangée.

## Mise à jour : rendez-vous inter-employés TEST
- [x] Les deux requêtes du flux de replanification RDV par ID (SELECT et UPDATE) n'exigent plus `user_id=auth.user.id`.
- [x] Les conditions `garage_id=ACTIVE_GARAGE_ID`, statut et version demeurent.
- [x] Commit frontend TEST `f2f731f9`.
- [ ] Tester le flux réel dans le navigateur avec deux comptes, y compris conflits et annulations.
- [ ] L'édition de la fiche complète de SO entre collègues n'est pas encore activée.
- [ ] Production inchangée.
