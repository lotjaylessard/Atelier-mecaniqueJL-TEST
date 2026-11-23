# S10 — Checkpoint des données réelles et vérification locale différentielle

Le 2026-11-23 à 21:23:17 UTC, requête SQL **lecture seule** exécutée sur l'actuelle PROD.

| Mesure | Données |
|---|---|
| garage_data lignes | 1 |
| Clients | 42 |
| BT | 88 |
| Factures | 87 |
| Dernière mise à jour JSON cloud | 2026-11-23 17:56:11.823 UTC |
| MD5 du JSONB source (`md5(data::text)`) | `cb5777bcb1f819bcc74fb73a9b22960f` |
| Storage objets connus | 55 |
| Références de fichiers dans les BT | 49 |
| Références manquantes | 0 |
| Fichiers non référencés | 6 |

La nouvelle commande `audit/s10-local-restore-business-integrity-READ-ONLY.psql` est destinée **uniquement** à la base restaurée `atelier_jl_restore_test`. Elle récupère l'empreinte JSON, les comptages et les références sans exporter de dossiers clients ni modifier la base.

## Pour vérifier l'ancien test PowerShell sans le refaire
Comparer l'empreinte MD5 et les chiffres retournés par le script local à ce checkpoint. Si l'empreinte diffère, **ce n'est pas nécessairement un bug** : l'ancien dump peut avoir été créé avant la dernière écriture dans PROD. Le traiter comme une copie historique, ne jamais le déclarer sauvegarde finale à jour.

La restauration PostgreSQL PowerShell déjà réalisée demeure acquise. Les erreurs de rôles/Vault de son retour code 1 restent distinctes des résultats de données métier. Une base locale PostgreSQL ne démontre pas la récupération des octets Storage ni le fonctionnement de l'Auth/Supabase complet.

## Interdictions permanentes
- Ne pas exécuter le script sur Supabase PROD ou Supabase TEST.
- Ne pas mettre les données métiers réelles dans GitHub, dans des logs CI ou des tests publics.
- Ne pas supprimer les six fichiers non rattachés.
- Ne pas faire de réconciliation `UPDATE` ou d'import dans une base réelle avant reprise testée sur environnement isolé et approbation.
- Un checkpoint du 23 novembre n'est **pas** une empreinte valable pour un cutover ultérieur : reprendre l'empreinte depuis PROD au moment du gel.
