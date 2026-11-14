# S08 — Prévalidation des fichiers joints BT (2026-11-13)

## Environnement
- GitHub : lotjaylessard/Atelier-mecaniqueJL-TEST, branche s08/soumissions.
- Supabase : TEST uniquement; production non modifiée.

## Changement ciblé (index.html)
Dans `initWorkOrderAttachments(wo)`, avant l'appel Storage `.upload(filePath,file)` :
- Bloque le téléversement si la session Supabase ou l'identifiant de garage n'est pas disponible.
- Bloque le téléversement lorsque l'état cloud n'est pas chargé ou présente un échec, des modifications locales non confirmées, une synchronisation en cours ou planifiée.
- Refuse les noms de fichiers vides, `.`, `..`, contenant `/` ou `\\`, ou les fichiers dont la taille est vide, non entière sûre ou inférieure/égale à zéro.
- L'affichage du nom original reste inchangé pour les fichiers valides.
- L'ancienne gestion d'erreur Storage conserve le `continue` AVANT l'ajout de référence au BT.

**Limite :** ce contrôle prévient certains téléversements non traçables, mais ne rend pas atomique un upload Storage suivi de la sauvegarde du JSON en cloud. En cas d'échec ultérieur de synchronisation, un objet orphelin demeure possible. Ne pas prétendre résoudre cette limite sans stratégie transactionnelle ou nettoyage contrôlé, avec validation Chrome.

## Validation actuelle
- Vérification statique : contrôle de session, synchronisation et fichier placés avant l'appel Storage.
- Extraction des six scripts JavaScript intégrés depuis le dernier index : cinq scripts classiques analysés sans erreur; le script ESM avec import réseau et top-level await a été analysé en contexte async après retrait de sa déclaration d'import.
- Trois contrôles SQL TEST relancés avec succès : gate d'intégrité général, protection anti-suppression BT et isolation Storage.
- Nouveau test de régression `tests/s08-upload-preflight.test.cjs` ajouté, mais son exécution Node via GitHub Actions n'est **pas confirmée**.

## Bloquants de clôture encore ouverts
- Navigation Chrome authentifiée dans TEST, dont validation du nouveau précontrôle de téléversement.
- Vérification des vrais fichiers Storage octet par octet et restauration isolée complète.
- Exécution attestée des tests GitHub Actions.
- Réglage Supabase Auth de protection contre les mots de passe compromis.
- Validation Chrome avant activation du verrouillage serveur des factures payées.

**Audit non terminé. Ne pas toucher à la production.**
