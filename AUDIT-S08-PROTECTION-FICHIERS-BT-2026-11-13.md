# S08 — Protection anti-suppression des pièces jointes (2026-11-13)

Projet : Supabase **TEST** nraijzsodgojkpyigefu, dépôt GitHub `lotjaylessard/Atelier-mecaniqueJL-TEST`, branche `s08/soumissions`. Production inchangée.

## Problème détecté et correction appliquée
L'ancienne politique Storage permettait à un utilisateur authentifié de **supprimer ou écraser directement son fichier par l'API**, même si un BT en conservait la référence. Le logiciel client ne faisait pas de suppression physique par son interface actuelle, mais une requête API pouvait le faire.

Nouvelle fonction privée `s08_private.is_bt_attachment_referenced(name)` : recherche, côté serveur (SECURITY DEFINER, search_path fixé), si un objet figure encore dans les pièces jointes d'au moins un BT d'un compte. Les politiques `Garage files delete` et `Garage files update` refusent maintenant les modifications des fichiers liés, même lorsqu'ils appartiennent au demandeur. Les fichiers non référencés conservent la possibilité d'être gérés par leur propriétaire, sous les autres règles existantes.

## Vérifications concrètes
- SQL lecture seule : 4/4 pièces jointes liées identifiées et protégées par le prédicat.
- Rejet logique pour un chemin fictif non référencé : validé.
- Politiques UPDATE (USING + WITH CHECK) et DELETE vérifiées au catalogue.
- Test de régression ajouté : `tests/s08-storage-referenced-file-mutation-guard.sql`, exécuté sur TEST avec succès.
- 6 tests SQL antérieurs rejoués avec succès : RLS propriétaire, Storage, références historiques, intégrité des métadonnées, paiements payés/partiels (validateur expérimental toujours inactif sur les vraies écritures).
- Compteurs inchangés après test : `garage_data` 3 lignes, `garage_quotes` 12 lignes, Storage `wo-files` 6 objets, autorisation héritée 1.
- Security Advisor : 2 INFO RLS de tables privées, 3 WARN fonctions privilégiées du minuteur, 1 WARN Auth protection des mots de passe divulgués.

## Fichiers / commits
- `supabase/s08_test_prevent_referenced_file_mutation.sql`
- `tests/s08-storage-referenced-file-mutation-guard.sql`

## Ce qui reste avant 100 %
- Contrôler les octets des vrais fichiers, leur SHA-256 et une restauration réellement isolée.
- Exécuter Chrome authentifié sur la branche TEST et valider les parcours SO → BT → facture et les opérations de pièces jointes.
- Confirmer le résultat du workflow GitHub Actions; il n'est pas accessible via les seuls statuts de commit disponibles.
- Valider puis activer les protections serveur des factures déjà payées après essais UI.
- Activer et confirmer Supabase Auth leaked-password protection via les réglages du projet.

**Ne pas conclure à 100 %. Aucun dossier client ni fichier Storage n'a été modifié ou supprimé dans cette étape.**
