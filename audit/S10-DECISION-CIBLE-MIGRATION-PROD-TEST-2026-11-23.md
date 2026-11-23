# S10 — Décision de sécurité : comparaison PROD → TEST (2026-11-23)

## Décision
**NE PAS importer directement les données réelles dans le projet TEST vivant. NE PAS purger TEST.**
Conserver PROD comme source de vérité des données réelles, TEST comme référence du code et du schéma, et **préparer une restauration fusionnée dans un environnement isolé** avant toute bascule. Une copie locale PostgreSQL existe déjà via PowerShell, mais il faut distinguer son préflight réussi d'une restauration physique complète (code retour antérieur 1).

Il s'agit d'une décision de méthode de migration, pas d'une autorisation de migrer.

## Inventaire vérifié en lecture seule
| Élément | PROD feeapfylfzlvgnqtglnh | TEST nraijzsodgojkpyigefu |
|---|---:|---:|
| Auth users | 1 | 3 |
| garage_data rows | 1 | 3 |
| Clients JSON garage actif | 42 | 18 |
| BT JSON garage actif | 88 | 21 |
| Factures JSON garage actif | 87 | 14 |
| Storage wo-files objets | 55 (public) | 6 (privé) |
| Edge Functions | 0 | 4 |
| garage_quotes | non installée | 14 |
| garage_timer_sessions | non installée | 10 |
| garage_external_calendar_connections | non installée | 3 |
| garage_external_calendar_events | non installée | 828 |

**Identité bloquante :** l'UUID propriétaire de PROD n'existe pas dans `auth.users` de TEST. Les objets Storage historiques PROD appartiennent à l'UUID propriétaire PROD, sous `clients/...`. Un simple transfert des lignes/objets dans TEST ne conserverait pas automatiquement les permissions, les anciennes sessions et la logique des URLs.

TEST comporte également 1 `garage_data` sans `garage_id`, 1 ligne OAuth tokens et 2 secrets de flux FamilyWall. Ils ne doivent pas être écrasés, purgés ni déplacés sans plan de remappage et chiffrement.

PROD contient **49 références d'attachements sur 88 BT** avec **0 référence absente**, plus **6 objets non référencés** (tous conservés). Ces chiffres ont été validés en lecture seule le 23 novembre.

## Séquence unique — sans redondance
1. **Gel uniquement à la bascule** (pas maintenant) et sauvegarde PROD actualisée; réutiliser l'audit PowerShell et ne contrôler que ses limites réelles. Préserver les fichiers physiques.
2. Dans une base isolée jetable, installer le schéma TEST sur une copie fidèle de PROD et garder **l'UUID propriétaire PROD**, ses données JSON et les références des 55 objets; inclure les données financières et vérifier les sommes avant/après.
3. Importer les **fichiers binaires** vers Storage privé et préserver/migrer les chemins historiques avec un contrôle des propriétaires et URL signées; ne pas confondre métadonnées et octets.
4. Ajouter les deux autres identités/garages uniquement par migration Auth et membership prévue, pas par copie aveugle des utilisateurs TEST. Déplacer les calendriers via reconnexion OAuth/feeds PROD, jamais recopier les secrets TEST.
5. Recette ciblée owner/employee/autre garage, devis → BT → facture → paiement, pièce jointe ancienne et nouvelle, horaires. Comparer comptages/factures/total payé, et test de rollback.
6. **GO final seulement** après preuve de restauration, contrôles réels, emplacement cible identifié et approbation explicite pour les écritures sur l'un des projets existants.

## Règles protectrices
- ZÉRO écriture/suppression aujourd'hui dans PROD **et** TEST; ne pas renommer TEST ni changer les endpoints.
- Ne pas réutiliser les clients, factures, BT ou paiements fictifs de TEST comme données réelles.
- Interdire le nettoyage de TEST avant sauvegarde et inventaire détaillé, même si le projet devient ensuite la cible.
- La comparaison des 2 projets a été faite en lecture seule. Tout script candidat doit être bloqué pour les projets existants tant que les conditions ne sont pas satisfaites.
- Les travaux précédents sur la migration **vers PROD** restent des ressources techniques, pas une raison de les exécuter automatiquement.
