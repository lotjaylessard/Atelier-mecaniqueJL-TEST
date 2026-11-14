# S08 — Avis de récupération des pièces jointes non rattachées (2026-11-13)

Projet : `lotjaylessard/Atelier-mecaniqueJL-TEST`, branche `s08/soumissions`. Supabase : **TEST** `nraijzsodgojkpyigefu` uniquement. Aucune opération sur la production.

## Problème vérifié
Les correctifs de téléversement conservaient en `localStorage` une trace `atelier-test-unlinked-attachment-v1` lorsqu'un fichier Storage était envoyé mais que le compte ou le verrou du BT changeait pendant l'upload. **Le programme ne proposait pas de retrouver ces traces après fermeture/rechargement**. Ce n'était pas une restauration effective des octets.

## Correction UI TEST
- Nouveau `showUnlinkedAttachmentRecoveryNotice()` recherchant uniquement les entrées correspondantes au compte et garage connectés.
- Avis compact à l'écran et bouton `Exporter les références JSON` : fichier avec les chemins, jamais les octets du fichier.
- Validation du compte/garage à nouveau lors du clic d'export.
- Avis retiré lors de la déconnexion.
- Aucun objet Storage supprimé; aucun rattachement BT automatique; aucune copie ou restauration cachée.
- L'ancien mécanisme d'export des sauvegardes du garage et de récupération des notes reste distinct et inchangé.

## Vérifications exécutées
- Cinq scénarios de la nouvelle notice : propriétaire autorisé, compte étranger bloqué, autre garage bloqué, changement de compte après affichage bloque l'export, export normal en manifest uniquement — **5/5 réussis** sur le code de `index.html` dans un environnement JavaScript simulé.
- Relecture de **six suites JS** : **30/30 tests** exécutés par harnais V8 isolé, portant sur upload/mock, prévalidation, invariants sauvegarde, inspection, version Supabase JS et avis de récupération.
- Syntaxe des six scripts intégrés à l'index : six contrôles sans erreur détectée (script module analysé avec import externe isolé et contexte asynchrone).
- **5 tests SQL TEST** rejoués sans erreur : intégrité, isolation Storage, protections anti-suppression, accès hérité et paiements partiels.

## Limites restantes
- Le harnais V8 ne constitue **ni** un essai Chrome authentifié **ni** un succès du workflow GitHub Actions.
- Les fichiers Storage réels n'ont pas été téléchargés ni vérifiés octet par octet. La restauration complète isolée reste non validée.
- Le site n'effectue pas de récupération automatique des fichiers conservés : export de références seulement.
- Supabase Auth : protection des mots de passe divulgués à activer et confirmer.
- Le validateur serveur des factures payées est toujours en prévisualisation non branchée; recettes Chrome nécessaires avant activation.
- L'anomalie de montant d'une facture historique de TEST, déjà consignée, n'a pas été modifiée.

**L'audit reste estimé à 96 %, sans preuve suffisante pour annoncer 100 %.**
