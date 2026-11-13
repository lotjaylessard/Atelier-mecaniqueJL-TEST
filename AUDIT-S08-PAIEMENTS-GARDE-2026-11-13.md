# Audit S08 — Reprise contrôlée : protection des paiements (2026-11-13)

## Environnement
- Dépôt : lotjaylessard/Atelier-mecaniqueJL-TEST
- Branche : s08/soumissions
- Projet Supabase : Atelier-mecaniqueJL-TEST seulement
- Production : non touchée

## Réalisé
1. Validateur privé de factures `s08_private.preview_paid_invoice_integrity` renforcé sur TEST (version 2).
2. Factures payées et archivées : aucune modification/suppression des données historiques permise; archivage initial autorisé sans changement financier.
3. Factures partiellement payées : historique ancien immuable, nouveaux paiements ajoutés uniquement avec montants cohérents; transition vers « paid » admise quand le solde est atteint; effacement, modification de total et dépassement du total refusés.
4. Cas limite supplémentaire : refus d'un statut absent et de changements des métadonnées de règlement pendant que la facture reste partielle.
5. Vérification sur les formes réelles des deux garages actifs : modifications de notes autorisées, tentative de changement du total payé rejetée, archivage cohérent autorisé. Aucun `UPDATE` effectué.
6. Validation intégrée à un vrai `BEFORE UPDATE` trigger **sur une table temporaire fictive**, avec annulation complète de la transaction. Les changements légitimes passent et les changements interdits échouent.
7. 7 scripts SQL de régression rejoués sans erreur, y compris l'isolation RLS, Storage et les garde-fous du minuteur.

## Fichiers nouveaux
- `supabase/s08_preview_invoice_guard_v2.sql`
- `tests/s08-preview-partial-payment-integrity.sql`
- `tests/s08-preview-real-snapshot-shapes.sql`
- `tests/s08-invoice-guard-temporary-trigger.sql`

## Contrôle d'absence de modifications
- 3 lignes `garage_data`, 12 soumissions, 6 fichiers Storage dans TEST.
- Un seul trigger métier sur `garage_data`, comme avant la reprise.
- Le validateur expérimental n'est **pas** attaché à `garage_data` et ne peut pas être appelé par `anon` ou `authenticated`.
- Les deux snapshots actifs acceptent les opérations identiques (no-op).
- Conseillers sécurité : 3 avertissements SECURITY DEFINER (minuteur authentifié), 1 avertissement protection des mots de passe compromis, 2 informations RLS sans politique sur tables privées.

## Non validé — bloquant 100 %
- Parcours navigateur Chrome de bout en bout sous compte TEST authentifié, nécessaire avant d'attacher ce trigger aux vraies sauvegardes.
- Téléchargement des vrais octets Storage + comparaison SHA-256 et restauration isolée complète avec ces fichiers.
- Résultat confirmé du workflow GitHub Actions (statuts non retournés par l'outil GitHub).
- Activation et test du réglage Auth contre mots de passe compromis.
- Anomalie historique de facture payée/archivée (total 50.00, payé 57.49) : observation TEST, aucune correction non autorisée.

**Ne pas déclarer audit à 100 % à ce stade.**
