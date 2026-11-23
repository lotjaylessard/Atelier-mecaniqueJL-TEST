# S10 — Blocage confirmé : finalisation de facture limitée à TEST

Inspection du code actif Supabase TEST et du frontend `index.html` de `integration-finale` (23 novembre 2026).

## Preuve
- RPC `public.s08_finalize_bt_invoice_unified_staged` est `SECURITY INVOKER` et vérifie explicitement `auth.uid()` contre un UUID utilisateur TEST et `p_garage_id` contre un UUID garage TEST. Son commentaire dit « TEST-only, single garage / single owner rollout gate. Never expose this function to other garages or production ».
- Le frontend **appelle réellement cette RPC deux fois** dans le parcours BT→facture : une simulation `p_dry_run:true`, puis l'écriture `p_dry_run:false`.
- Copier cette RPC dans PROD empêcherait la finalisation de facture pour le propriétaire PROD et les autres garages. Supprimer simplement les gardes TEST sans contrôles d'appartenance/RLS ne serait pas sûr.
- Le frontend contient également des messages « Supabase TEST » à retirer lors du packaging PROD.

## Correctif requis avant GO
1. Concevoir une variante **multi-garage** de cette RPC, sans UUID codés en dur, avec `auth.uid()`, appartenance et permissions adéquates, vérification du BT/garage et version atomique, et droits EXECUTE minimaux.
2. Tester le chemin positif owner A et employee A selon leurs droits, puis le refus owner B et les requêtes croisées. Vérifier simulation puis commit, concurrence et rollback.
3. Adapter les appels frontend à la RPC validée et les messages TEST, en conservant la synchronisation cloud et les protections de double facturation.
4. **Ne pas déployer cette fonction TEST en PROD**. Ne pas changer PROD avant sauvegarde, restauration isolée, recette et autorisation explicite.

## Statut
**NO-GO bloquant confirmé.** Le contrôle d'appartenance du helper minuteur est valide au niveau du code, mais ne résout pas ce blocage distinct.
