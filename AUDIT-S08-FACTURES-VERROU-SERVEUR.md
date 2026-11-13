# S08 — Protection serveur des factures réglées : écart à corriger

**Date :** 2026-11-13  
**Environnement :** Atelier-mecaniqueJL-TEST exclusivement. Aucun changement aux données.

## Constat vérifié
- La table `public.garage_data` contient les factures dans `data->'invoices'`.
- Le rôle `authenticated` dispose de la permission `UPDATE` sur ses lignes de `garage_data` via RLS.
- Le seul trigger actuel de la table est `protect_garage_data_ids_trigger`; sa fonction interdit les changements de `garage_id` et `user_id` uniquement.
- Aucun trigger actuel ne garantit l'immuabilité serveur des factures payées et archivées.
- Les protections UI des factures réglées ne suffisent donc pas à garantir leur intégrité si un client authentifié appelle directement l'API avec un snapshot JSON modifié.

## Anomalie observée séparément
- Une facture payée ET archivée dans TEST a `total = 50.00`, `paidAmount = 57.49` et deux paiements dont la somme est `57.49`.
- `applyGST=false`, `applyQST=false`, `gst=0`, `qst=0` dans la copie courante.
- Ce décalage n'est pas une preuve d'origine ni de fraude. Ne modifier aucun montant sans rapprochement avec le document imprimé et l'historique.

## Correction recommandée (à implémenter et tester sur TEST avant production)
1. Mettre une validation transactionnelle serveur contre les modifications/suppressions d'une facture déjà payée ou archivée.
2. Permettre explicitement **l'archivage légitime** d'une facture déjà payée sans modifier ses champs financiers ou son historique.
3. Respecter les paiements partiels : l'ajout légitime d'un paiement reste possible jusqu'au règlement complet.
4. Tester les cas : facture payée identique lors d'une autre sauvegarde, changement de montant, suppression de facture, modification d'un paiement, archivage, facture partielle avec nouveau paiement, reprise après conflit de version.
5. Si une régularisation historique est nécessaire, passer par un mécanisme audité, jamais une correction silencieuse.
6. Vérifier les appels UI de TEST dans Chrome avant toute contrainte nouvelle susceptible de bloquer des sauvegardes normales.

## Décision
**Ne pas annoncer 100 %** tant que le verrouillage serveur n'est pas validé. Aucun trigger nouveau appliqué dans ce contrôle pour préserver les opérations du garage.
