# S10 — Revue du code SQL des cinq RPC critiques (23 novembre 2026)

Examen en lecture seule des définitions actives dans Supabase TEST, non des copies GitHub. Aucune modification de TEST/PROD.

| RPC | SECURITY DEFINER | auth.uid | verrouillage FOR UPDATE | contrôle de version | search_path |
|---|---|---|---|---|---|
| s06_timer_post_labor | oui | oui | oui | oui | vide |
| s06_timer_recover_with_adjustment | oui | oui | oui | oui | vide |
| s06_timer_transition | oui | oui | oui | oui | vide |
| s08_convert_quote_to_workorder | non | oui | oui | oui | public, pg_temp |
| s08_finalize_bt_invoice_unified_staged | non | oui | oui | oui | public, pg_temp |

Observations détaillées : `s06_timer_recover_with_adjustment` sélectionne la session par `id` et `user_id=auth.uid()`, verrouille `FOR UPDATE`, compare `revision`, exige `status=running`, vérifie la modifiabilité du BT via `public.s06_timer_check_work_order(uid,garage_id,work_order_id)`, puis effectue un UPDATE conditionnel. La vérification de garage est indirecte; inspecter le helper avant de conclure. L'absence du texte `garage_members` dans une fonction ne signifie pas absence de contrôle indirect.

Les cinq corps ne contiennent pas de signe évident de SQL dynamique selon recherche textuelle, mais cela ne prouve pas l'absence de vulnérabilité. Les RPC `SECURITY DEFINER` exigent des tests d'accès cross-garage et la vérification de leurs fonctions auxiliaires. Les RPC de conversion/facturation `SECURITY INVOKER` dépendent aussi des RLS effectives.

**NO-GO** tant que les RPC et politiques exactes ne sont pas installées sur un Supabase isolé et testées avec owner A / employee A / owner B. La copie PostgreSQL Windows contient 12 tables mais pas les fonctions, policies ou rôles Supabase : ne pas la déclarer fonctionnelle. Ne pas relancer les phases 1–4.
