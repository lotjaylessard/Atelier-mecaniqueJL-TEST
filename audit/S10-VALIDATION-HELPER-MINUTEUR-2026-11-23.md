# S10 — Validation du helper d'autorisation du minuteur (23 novembre 2026)

Source : `pg_get_functiondef(public.s06_timer_check_work_order(uuid,uuid,text))` dans Supabase TEST, lecture seule.

Contrôles vérifiés dans le corps actif :
- Refuse les paramètres nuls.
- Refuse si `p_uid IS DISTINCT FROM auth.uid()`.
- Refuse si aucune ligne `garage_members` ne correspond au couple `(user_id,garage_id)`.
- Lit `garage_data` du garage demandé avec `FOR SHARE`.
- Refuse si les tableaux JSONB `workorders` / `invoices` manquent.
- Exige un seul BT correspondant, statut `en_cours`, numéro unique, aucune facture associée.

Appels indirects observés :
- `s06_timer_recover_with_adjustment` : appelle le helper.
- `s06_timer_transition` : appelle le helper et vérifie aussi `garage_members`.
- `s06_timer_post_labor` : vérifie `garage_members` directement, sans appel textuel au helper.
- `s08_convert_quote_to_workorder` : vérifie `garage_members` directement.
- `s08_finalize_bt_invoice_unified_staged` : ne contient pas de référence textuelle à `garage_members`; fonction SECURITY INVOKER, dépendance RLS à confirmer par test authentifié.

**Limite :** les vérifications statiques ne démontrent pas le refus intergarage réel. Les 12 tables PostgreSQL locales n'ont ni RLS Supabase complète ni RPC installées. Statut NO-GO jusqu'à recette sur Supabase isolé.
