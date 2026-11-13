# S08 — Complément au point de contrôle (2026-11-13)

**Branche :** s08/soumissions — **Supabase :** TEST uniquement.

## Résultats de cette reprise
- 10 scénarios de restauration physique fictive exécutés dans Node.js 22, tous réussis (répertoire temporaire, aucune donnée réelle).
- 13 factures des deux garages TEST inspectées en lecture seule.
- 1 facture payée et archivée présente un écart : total 50,00; paiements 57,49; historique en deux paiements égal à 57,49. Ne pas corriger automatiquement.
- 12 soumissions inspectées : les 7 conversions sont correctement liées à leur BT par **numéro** (champ converted_bt_id), et par sourceQuoteId/sourceQuoteNumber. Ne pas comparer converted_bt_id au champ interne workorder.id.
- La table garage_data accepte l'UPDATE par son propriétaire, avec un unique déclencheur protégeant user_id et garage_id. Les champs financiers des factures payées ne sont pas verrouillés **au niveau serveur**.
- Un validateur expérimental non branché `s08_private.preview_paid_invoice_integrity` a été ajouté sur TEST. Il est inaccessible à anon et authenticated et n'est attaché à aucun trigger.
- 10 cas fictifs SQL du validateur réussis : identité, montant, suppression, historique, archivage, désarchivage, facture archivée altérée, paiement partiel, transition vers payée, numéro doublonné.
- Tests automatisés GitHub Actions toujours non confirmés par les outils connectés. Pas de validation Chrome authentifiée dans cette reprise.

## Nouveaux fichiers
- `AUDIT-S08-ANOMALIE-FACTURE-2026-11-13.md`
- `AUDIT-S08-FACTURES-VERROU-SERVEUR.md`
- `tests/s08-quote-bt-link-integrity.sql`
- `supabase/s08_preview_paid_invoice_guard.sql`
- `tests/s08-preview-paid-invoice-integrity.sql`

## Conditions encore nécessaires avant 100 %
1. Valider dans Chrome le cycle réel SO → BT → facture et l'archivage.
2. Vérifier les fichiers Storage réels octet par octet et réussir une restauration isolée de bout en bout.
3. Confirmer et résoudre les éventuels échecs des workflows Node GitHub.
4. Tester dans Chrome une protection serveur des factures payées puis seulement ensuite l'activer.
5. Activer/vérifier la protection Auth contre les mots de passe compromis; comprendre les 3 avertissements SECURITY DEFINER encore présents.

**Aucune écriture dans les dossiers métier ni aucune modification de production n'a été effectuée.**
