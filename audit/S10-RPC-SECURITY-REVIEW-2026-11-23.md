# S10 — Revue effective des 16 RPC de TEST (23 novembre 2026)

Source : requête de catalogue PostgreSQL en lecture seule sur le projet Supabase TEST. Aucune mutation PROD ou TEST.

| Fonction | SECURITY DEFINER | EXECUTE authenticated | auth.uid() dans corps | garage_members dans corps |
|---|---:|---:|---:|---:|
| backup_garage_member_ids | oui | oui | oui | oui |
| backup_garage_quotes | oui | oui | oui | oui |
| backup_garage_storage_paths | oui | oui | oui | oui |
| can_read_garage_file | oui | non | oui | oui |
| is_garage_member | oui | non | oui | oui |
| protect_garage_data_ids | non | oui (PUBLIC) | non | non |
| s06_timer_check_work_order | oui | non | oui | oui |
| s06_timer_post_labor | oui | oui | oui | oui |
| s06_timer_recover_with_adjustment | oui | oui | oui | non |
| s06_timer_transition | oui | oui | oui | oui |
| s08_assign_quote_tracking_number | non | oui (PUBLIC) | non | non |
| s08_check_bt_invoice_preflight | non | oui | oui | non |
| s08_convert_quote_to_workorder | non | oui | oui | oui |
| s08_finalize_bt_invoice_atomic | non | non | oui | non |
| s08_finalize_bt_invoice_unified_staged | non | oui | oui | non |
| s08_finalize_bt_invoice_validated | non | non | oui | non |
| s09_protect_quote_identity | non | oui (PUBLIC) | non | non |

Note: absence de la chaîne littérale `garage_members` dans le corps ne prouve **pas** l'absence de contrôle d'appartenance (contrôle indirect via autre fonction possible). Les fonctions déclencheur n'ont normalement pas vocation à être appelées par les clients; vérifier leur exposition et privilèges. Les signatures exactes et GRANT doivent être copiés depuis les catalogues TEST; ne pas déduire qu'une fonction peut être invoquée parce que son nom apparaît dans le navigateur.

## Vérifications bloquantes avant PROD
1. Lire les corps SQL complets de `s06_timer_recover_with_adjustment`, `s06_timer_post_labor`, `s06_timer_transition`, `s08_convert_quote_to_workorder` et `s08_finalize_bt_invoice_unified_staged`. Tester l'identité de l'utilisateur, l'appartenance au garage et les contrôles de version.
2. Vérifier que `s08_finalize_bt_invoice_atomic` et `s08_finalize_bt_invoice_validated` restent non exécutables par `authenticated`, et que le frontend appelle bien la variante autorisée.
3. Vérifier les `SECURITY DEFINER` : `search_path` fixé, objets qualifiés, absence de SQL dynamique non contrôlé, révocation d'EXECUTE à PUBLIC, rôles minimaux.
4. Tester réellement en Supabase isolé trois comptes : owner A, employee A, owner B; appels RPC inter-garages refusés, sans mutation, et parcours fonctionnel positif autorisé.
5. Les 12 tables locales sont installées mais **sans politiques RLS ni RPC**; leur présence ne constitue pas un test de sécurité ou de fonctionnement. Aucun changement PROD sans autorisation.

## Statut
NO-GO pour le déploiement. Priorité suivante : extraction exacte des définitions des RPC et politiques, reproduction dans un environnement Supabase isolé, puis tests authentifiés. Ne pas réexécuter les phases 1–4 locales.
