# S10 — Tests transactionnels RPC facturation (TEST)

Le 23 novembre 2026, la fonction candidate `public.s10_finalize_bt_invoice_owner_candidate` a été installée dans Supabase TEST. Le `;` final de la définition SQL a été corrigé (commit `839fc761`).

Exécution SQL en transaction `BEGIN ... ROLLBACK`, rôle `authenticated` et JWT simulés via `request.jwt.claim.sub`, sans écriture persistante :

| Test | Résultat |
|---|---|
| owner A appelle RPC pour garage B | PASS denied |
| owner B appelle RPC pour garage A | PASS denied |
| owner A appelle RPC pour garage A avec BT inexistant | PASS authorized, invalid BT refused |

Catalogue : `anon_can_execute=false`, `authenticated_can_execute=true`, `SECURITY INVOKER`, aucun UUID TEST codé en dur dans la candidate.

**Limites réelles** : les tests ont simulé les JWT dans une transaction SQL; ce ne sont pas des requêtes HTTP Supabase avec de vraies sessions. Aucun test positif de facturation valide ni de concurrent write n'a été réalisé. Le frontend appelle encore l'ancienne RPC `s08_finalize_bt_invoice_unified_staged`; pas de bascule PROD. La candidate est **owner-only** et exige `garage_data.user_id=auth.uid()`, ce qui n'autorise pas les employés.

Statut : **3 tests d'autorisation PASS, déploiement PROD toujours NO-GO**. Étapes restantes : jeu de données synthétique isolé, dry-run positif, commit transactionnel et rollback, branchement frontend, tests multi-rôles, vérification finale.
