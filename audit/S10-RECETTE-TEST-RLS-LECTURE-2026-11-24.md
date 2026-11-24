# S10 — Recette sécurité Supabase TEST (2026-11-24, lecture seule)

**Portée :** projet TEST `nraijzsodgojkpyigefu`, trois comptes existants et deux garages existants. Aucun changement de schéma, de rôles, de données ni de fichiers. N'autorise pas un GO PROD.

## Tests RLS effectivement exécutés

Ces requêtes utilisent `BEGIN READ ONLY; SET LOCAL ROLE authenticated; set_config('request.jwt.claim.sub', ... , true)` et `ROLLBACK`. Les compteurs ne révèlent aucun identifiant client ou contenu.

| Lecture | Propriétaire garage A | Employé garage A | Propriétaire garage B |
|---|---:|---:|---:|
| garage_data | 1 | 1 | 1 (son propre garage) |
| garage_quotes | 14 | 14 | 0 |
| garage_calendar_notes | 6 | 0 | 0 |
| garage_schedule_events | 1 | 1 | 0 |
| garage_external_calendar_events | 812 | 0 | 0 |
| garage_external_calendar_connections | 3 | 0 | 0 |
| garage_timer_sessions | 10 | 0 | 0 |
| storage.objects (wo-files) | 6 | 6 | 0 |
| autre garage_data visible | 0 | 0 | 0 |

`anon`: 0 garage_data, 0 storage.objects. Les tables de soumissions/événements refusent SELECT à anon par permissions SQL.

## Fonctions privilégiées : tests fonctionnels de lecture

Appels **réels** sous `authenticated`, identités simulées par `request.jwt.claim.sub`, mêmes données TEST.

| Fonction | Propriétaire garage A (son garage) | Employé A (même garage) | Propriétaire B (garage A ciblé) |
|---|---:|---:|---:|
| backup_garage_member_ids | 2 | 0 | 0 |
| backup_garage_quotes | 14 | 0 | 0 |
| backup_garage_storage_paths | 6 | 0 | 0 |

**Nuance :** ces fonctions refusent la divulgation en retournant zéro ligne, **pas nécessairement en levant une exception**. Une première sonde qui attendait une exception n'était donc pas un test valide; le test correct par `count(*)` a été exécuté ensuite.

## Limites des tests de mutation

- Les politiques `INSERT`, `UPDATE`, `DELETE` ont été consultées, sans modifier TEST. Les tests sur les écritures et les URL signées réelles restent ouverts.
- Une tentative d'appel de `s06_timer_recover_with_adjustment` dans une transaction `READ ONLY` a retourné SQLSTATE `25006` : le `SELECT FOR UPDATE` à l'intérieur de la fonction exige une transaction écrivable. **Résultat non concluant sur l'autorisation intergarage de cette fonction; ne pas présenter cette erreur comme un refus d'accès vérifié.**
- Les alertes Supabase Security Advisor montrent six fonctions `SECURITY DEFINER` accessibles à `authenticated`; les trois fonctions de sauvegarde ont été sondées, les trois fonctions timer doivent être validées avec des scénarios contrôlés et un environnement isolé.
- Le propriétaire A et l'employé A ont le droit de lecture du même garage : les protections d'écriture par identifiant de facture, propriétaire et version doivent encore être vérifiées fonctionnellement.
- Ces contrôles SQL ne remplacent ni le navigateur, ni une vraie session OAuth, ni une copie isolée de la PROD.

**Verdict : contrôles de lecture multi-garage PASS ; tests d'écriture, timers et navigateur INCOMPLETS ; GO PROD = NON.**
