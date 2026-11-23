# Migration multigarage — registre de validation

Dernière révision : 2026-11-22. Branche de travail : `integration-finale`.

## Règles non négociables
- Ne jamais importer les données synthétiques TEST en production.
- Ne jamais modifier PROD avant sauvegarde complète vérifiée et feu vert explicite.
- Ne pas modifier `main` ni publier avant validation de l'intégration.
- Préserver les données historiques même lorsqu'elles contiennent des incohérences.
- Deux comptes propriétaires distincts, deux garages isolés, accès employés contrôlé.

## Contrôles réalisés (lecture seule)
- [x] Branche `integration-finale` créée depuis `feature/notes-bt-historique`.
- [x] Profits estimés pièces, main-d'œuvre et total présents dans le code de la branche.
- [x] TEST : 2 garages, 2 propriétaires, 1 employé, 2 lignes `garage_data` liées, aucune adhésion orpheline.
- [x] TEST : 1 ligne `garage_data` historique sans garage; ne pas migrer.
- [x] TEST : bucket `wo-files` privé; liens signés pour consultation des BT.
- [x] PROD : 42 clients, 48 véhicules imbriqués dans `clients[].vehicles`; aucune collection de véhicules malformée.
- [x] PROD : 87 BT, 87 factures, 55 fichiers Storage (89 068 008 octets).
- [x] TEST : les fonctions de minuterie RPC exigent un utilisateur authentifié; pas de droit EXECUTE anonyme sur les trois fonctions exposées.

## Bloquants à corriger et à tester
- [ ] **B1 — Accès employé.** La politique RLS `garage_data` utilise `auth.uid() = user_id`. Le compte employé du TEST est membre du garage mais n'est pas propriétaire de la ligne. Définir précisément les droits owner/employee et remplacer la politique uniquement après tests d'isolation.
- [ ] **B2 — Minuterie employé.** `s06_timer_check_work_order` et `s06_timer_post_labor` filtrent `garage_data` par `gd.user_id = p_uid/v_uid`. Adapter avec contrôle d'appartenance au garage, sans autoriser l'accès à un autre garage.
- [ ] **B3 — Tests authentifiés.** Vérifier owner A, employee A, owner B : SELECT/UPDATE `garage_data`, BT, factures, minuterie, pièces jointes et calendriers. Les vérifications SQL administrateur ne remplacent pas ces tests.
- [ ] **B4 — Fichiers.** Préserver les 55 fichiers PROD, vérifier les 49 références BT et examiner les 6 fichiers non référencés; convertir les anciennes URLs publiques en chemins privés et liens signés.
- [ ] **B5 — Sauvegardes.** Export JSON PROD et fichiers Storage, sauvegarde de l'autre garage, test de restauration isolée et plan de retour arrière.
- [ ] **B6 — Données historiques.** Conserver les 21 BT à référence véhicule ancienne, les factures à zéro, l'ancien trop-perçu et les montants à précision supérieure à 2 décimales sans correction silencieuse.
- [ ] **B7 — Sécurité.** Examiner les trois RPC SECURITY DEFINER; vérifier permissions `garage_members`, accès `admin` aux fichiers, fonctions calendrier sans vérification JWT à la passerelle, et activer la protection contre les mots de passe compromis.
- [ ] **B8 — Performance.** Examiner index FK `garage_quotes.user_id`, `garage_timer_sessions.garage_id`, et optimisation `(select auth.uid())` dans la politique RLS.
- [ ] **B9 — Mise en production.** Tests de non-régression, sauvegarde récupérable, validation GO/NO-GO, déploiement contrôlé, surveillance et procédure de rollback.

## Tests d'acceptation indispensables
1. Owner A peut lire et modifier A; ne peut ni lire ni modifier B.
2. Employee A peut effectuer uniquement les actions autorisées sur A; ne voit rien de B.
3. Owner B peut lire et modifier B; ne peut ni lire ni modifier A.
4. La minuterie ne peut modifier un BT d'un autre garage, même avec des IDs connus.
5. Les liens de fichiers ne divulguent aucun fichier d'un autre garage.
6. Un conflit de version cloud ne détruit ni les données ni les fichiers.
7. Tous les compteurs, montants, BT, factures, clients et véhicules correspondent aux inventaires PROD avant/après import.
8. La restauration d'une sauvegarde fonctionne avant tout basculement.

## Avancement
Estimation de planification au 2026-11-22 : **49 %**. Ce n'est pas un pourcentage calculé à partir de tests E2E réussis. Ne pas augmenter sans réalisation vérifiée d'un livrable.
