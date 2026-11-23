# S10 — Candidat Web PROD : état du 2026-11-23

**Statut : REVIEW ONLY — NO-GO déploiement.** Aucun site publié, aucune écriture Supabase PROD.

## Modifications réalisées
- `audit/s10-build-production-candidate.cjs` exige désormais l'URL du vrai projet PROD (`feeapfylfzlvgnqtglnh`), une clé **publishable** distincte de TEST et un répertoire de sortie neuf.
- `index.html` candidat utilise `PROD_STORAGE_PREFIX = "ar_prod_feeapfylfzlvgnqtglnh"`, puis `_<garage_id>` lors de `configureGarageStorage`.
- Ne lit ni n'efface les anciennes clés `ar_<user>_*`. La table `garage_data` PROD est la seule source de l'hydratation du nouveau cache; **aucune importation de cache historique ou de données TEST**.
- `login.html` reçoit le même projet Supabase. Le logo statique est copié lorsqu'il existe, mais aucune donnée métier TEST n'est copiée.
- Validation statique exige le chargement du bon garage, le cloud, l'hydratation et les URL signées.
- Le fichier `NO-GO-PROTOTYPE.txt` est volontairement inclus. `s10-check-production-bundle.cjs` **refuse** désormais explicitement ce candidat tant que les véritables critères GO ne sont pas vérifiés.
- Les tests unitaires de refus et de conversion sont ajoutés/actualisés dans GitHub; l'exécution complète CI doit encore être confirmée.
- Vérification directe des marqueurs source : occurrences uniques des trois sections de conversion; aucune référence à l'identifiant de projet TEST dans la transformation simulée.

## Bloquants GO réels
1. **Sauvegarde physique PROD vérifiée, restauration isolée et rapprochement métier.** En particulier 55 objets Storage, dont 49 références sur BT et 6 objets non rattachés : conserver les 55.
2. **Migration de schéma S10 et politiques RLS / Storage** validées sur une copie isolée de PROD. Bucket actuellement public; changement privé et stratégie de lecture/suppression contrôlée à faire lors du cutover.
3. **Recette de navigateurs avec vrais comptes** : owner A, employee A, owner B; BT → facturation → paiement, calendriers, fichiers et absence de fuite intergarage.
4. **Dépendances de production** : Edge Functions, OAuth Google/FamilyWall/Outlook et réglages de redirection vérifiés pour l'URL publique finale.
5. **Vérifier les anciennes clés locales** : ne jamais effacer `ar_<user>_*`; vérifier qu'aucune modification offline non synchronisée n'est perdue avant bascule.
6. Identifier le dépôt/site **véritable** de PROD et valider le package complet (pages et ressources) avant publication. Le seul dépôt actuellement accessible dans le connecteur GitHub est `Atelier-mecaniqueJL-TEST`.
7. Autorisation finale explicite pour les écritures PROD et plan de rollback prêt.

## Invariants
- Source du **code** : `integration-finale`. Source des **données** : PROD, jamais TEST.
- Aucune fusion avec `main` de TEST, aucun upload Pages PROD ni exécution SQL PROD à cette étape.
- Les contrôles statiques **ne remplacent pas** la recette réelle.
