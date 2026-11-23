# S10 — BLOCAGE STORAGE PROD / plan de compatibilité

**État : aucune modification appliquée à PROD.** Constats vérifiés par SQL en lecture seule le 23 novembre 2026.

## Constats
- Le bucket PROD `wo-files` est **public** et contient **55 objets**.
- Tous les objets sont rangés sous un seul premier segment de chemin; **aucun** n'a un préfixe UUID.
- Les 4 politiques PROD `storage.objects` permettent actuellement les opérations aux utilisateurs authentifiés sans vérification de garage.
- TEST a des politiques plus strictes et des fonctions `s08_private` qui ne sont pas incluses dans le candidat SQL S10.
- Les anciens liens publics doivent continuer de fonctionner; passer le bucket existant en privé immédiatement les casserait.

## Décision de migration recommandée (non exécutée)
1. Conserver les 55 objets et leurs chemins inchangés pour préserver les références historiques.
2. Réserver les chemins historiques à l'ancien garage, sans accorder de suppression à d'autres membres; identifier le préfixe existant par une requête SQL sécurisée avant de coder une politique.
3. Pour les nouveaux garages, imposer un espace de noms distinct contrôlé côté serveur et des politiques SELECT/INSERT/UPDATE/DELETE strictement liées à `auth.uid()` et `garage_members`.
4. Ne jamais copier aveuglément les politiques TEST : elles utilisent `s08_private` et des conventions de chemins qui ne correspondent pas aux fichiers historiques PROD.
5. Conserver le bucket public provisoirement signifie que les anciens fichiers restent accessibles par URL publique, **même avec des politiques RLS plus strictes**. Pour rendre les fichiers réellement privés, prévoir une transition séparée vers un bucket privé et des URL signées, en mettant à jour les références applicatives.
6. Avant tout déploiement : tester l'absence de lecture/suppression croisée entre garages, la consultation des 55 anciens fichiers, et les opérations d'upload/suppression du propriétaire.

**NO-GO :** ne pas déclarer la migration multigarage sécurisée tant que le modèle de stockage public/privé et les politiques effectives ne sont pas validés.
