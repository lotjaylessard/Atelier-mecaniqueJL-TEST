# S08 — Test CAS PostgreSQL réel à deux connexions (TEST)

Date : 2026-11-13. Base TEST seulement. Aucune donnée métier utilisée.

## Configuration fictive
Schéma privé temporaire s08_concurrency_audit, table cas_fixture(id,version,payload), ligne synthetic version=4 payload=baseline. Aucun droit anon/authenticated.

## Exécution en parallèle
Connexion A : BEGIN ; UPDATE cas_fixture SET version=5,payload='writer-A' WHERE id='synthetic' AND version=4 ; pg_sleep(2) ; COMMIT.
Connexion B : BEGIN ; pg_sleep(0.4) ; UPDATE cas_fixture SET version=5,payload='writer-B' WHERE id='synthetic' AND version=4 RETURNING id ; COMMIT.
Les appels SQL ont été démarrés en parallèle sur deux connexions indépendantes. lock_timeout=6s dans chaque transaction.

## Résultats observés
- B : stale_write_count=0.
- État final avant nettoyage : version=5, payload=writer-A.
- Schéma s08_concurrency_audit supprimé après test ; son absence a été confirmée.
- public.garage_data : 3 lignes avant et après, sans aucune écriture métier.

## Limites
Le résultat confirme un conflit d'écriture PostgreSQL sur une table fictive, pas encore le traitement du conflit par l'interface Chrome ni le cycle entier SO / BT / facture.
Pour répéter le test, recréer exclusivement un environnement fictif isolé. Ne jamais l'exécuter contre garage_data.