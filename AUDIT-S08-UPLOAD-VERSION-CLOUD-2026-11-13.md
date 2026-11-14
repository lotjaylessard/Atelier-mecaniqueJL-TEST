# S08 — Précontrôle cloud avant envoi d'une pièce jointe (2026-11-13)

**Cible :** `lotjaylessard/Atelier-mecaniqueJL-TEST`, branche `s08/soumissions`; Supabase TEST `nraijzsodgojkpyigefu`. Production intacte.

## Cause résiduelle analysée
L'opération actuelle charge d'abord les octets dans Supabase Storage, ajoute localement la référence dans le BT, puis appelle `saveWorkOrders()` qui **programme** (sans attendre) le push cloud. Ainsi, une erreur de sauvegarde après upload peut laisser un fichier Storage sans référence persistée. Storage + `garage_data` ne sont pas atomiques dans ce chemin.

## Modification sur TEST seulement
En amont de Storage upload, `initWorkOrderAttachments` vérifie maintenant :
- session et garage actifs; absence de synchronisation en attente ou d'échec,
- snapshot local strictement équivalent à la dernière confirmation cloud,
- `CLOUD_DATA_VERSION` entière et lisible,
- lecture serveur `garage_data.version` identique à la version attendue,
- identité, garage, révision et état local inchangés durant la lecture serveur.

Noms de fichiers dangereux et fichiers vides restent refusés (correction précédente).

## Vérifications exécutées
- 4 scénarios contre **la vraie fonction JavaScript** extraite de `index.html`, avec faux Supabase et Storage : session non prête, version périmée, erreur Storage et envoi nominal. Tous les quatre se sont comportés comme prévu; les échecs n'ajoutent aucune référence.
- 6 tests automatisés équivalents ont été enregistrés dans `tests/s08-upload-functional-mock.test.cjs` (ajout des noms dangereux et fichiers vides). **L'exécution de ce fichier Node par GitHub Actions n'est pas encore confirmée.**
- Relecture de l'index modifié : les 5 scripts classiques et un script ESM (contrôle approximatif de syntaxe avec import isolé et contexte async) ne présentent aucune erreur détectée.
- Supabase TEST : 3 lignes garage_data, 12 soumissions, 6 objets Storage, 1 trigger métier garage_data. Conseillers sécurité inchangés : 2 INFO RLS, 3 WARN SECURITY DEFINER minuteur, 1 WARN Auth password leak protection.

## Risque restant
Un upload **déjà réussi** peut toujours devenir orphelin si le push JSON ultérieur échoue, même si la prévalidation de version était correcte au début. Cela demande une procédure de récupération/compensation réellement testée (ne jamais supprimer automatiquement un document encore référencé).

## Clôture 100 % toujours bloquée
- Tests Chrome TEST authentifié.
- Empreintes SHA-256 sur octets réels et restauration isolée des fichiers.
- Statut GitHub Actions confirmé.
- Supabase Auth : leaked password protection.
- Recette Chrome avant activation du trigger des factures réglées.

**Aucune écriture aux données client et aucune intervention sur PROD.**
