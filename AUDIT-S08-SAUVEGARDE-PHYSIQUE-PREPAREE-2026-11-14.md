# S08 — Outil de sauvegarde physique vérifiable (14 novembre 2026)

**Environnement :** GitHub `lotjaylessard/Atelier-mecaniqueJL-TEST`, branche `s08/soumissions`; projet Supabase TEST `nraijzsodgojkpyigefu`. Production non touchée.

## Objectif : lever le blocage des véritables octets de pièces jointes
Avant cette étape, l'export JSON ne contenait que les références Storage (`bytesIncluded:false`). Une restauration physique complète n'était pas vérifiable.

J'ai ajouté **un outil séparé, à lancement volontaire**, limité au compte authentifié et au dossier local choisi manuellement :
- `audit/s08-physical-backup.html` : formulaire de sauvegarde TEST sur la même origine `http://127.0.0.1:8765` que le garage, vérification via `auth.getUser()` et permission explicite Chrome/Edge `showDirectoryPicker`.
- `audit/s08-physical-backup.js` : énumère le dossier Storage appartenant au compte (pagination, sous-dossiers), complète avec les pièces jointes encore référencées dans les BT, y compris les références héritées accessibles grâce aux règles en vigueur; télécharge **uniquement** les objets autorisés par Supabase.
- Chaque objet est sauvegardé sous le chemin original dans un dossier local `files/`, son SHA-256 est calculé, puis les octets du fichier **relus du disque local** sont comparés à la même empreinte.
- `garage-data.json` conserve les données des garages accessibles du compte : clients, notes, BT, factures, paramètres, etc., ainsi que les soumissions paginées.
- `manifest.json` indique les chemins, tailles, SHA-256, références, erreurs, statut `COMPLETE` ou `INCOMPLETE`. Un fichier manquant, un chemin dangereux, un changement de compte, de version garage ou de soumission pendant la sauvegarde empêche d'annoncer `COMPLETE`.
- **Aucune modification de Supabase ni suppression de fichiers, aucune restauration automatique.** Les données exportées étant privées, le dossier local doit être protégé.

## Tests exécutés
- `tests/s08-physical-backup.test.cjs` : six tests Node avec Storage et disque fictifs, vérification des SHA-256, JSON/notes/soumissions, fichiers hérités, refus d'accès et versions modifiées.
- `tests/s08-physical-backup-chromium.cjs` : véritable Chromium headless ouvrant la page et simulant un utilisateur authentifié ainsi qu'un dossier local fictif. **Aucun identifiant réel ni octet de client utilisé en CI.**
- `tests/s08-preview-local-http.test.cjs` étendu pour vérifier que les deux nouveaux fichiers sont servis via le serveur local de prévisualisation.
- GitHub Actions run `43549439098` : **87 tests Node, 87 réussis, 0 échec**, et **trois scénarios Chromium réels réussis** (BT/pièce jointe, login fictif, nouvelle page de sauvegarde).
- Artefact GitHub Actions `garage-s08-preview-0bedb7bbe4059cab61614f78e81b7a8ad8cb0b4e`, archive `Garage-Atelier-JL-S08-TEST-Sauvegarde-Physique.zip`, identifiant `14095532887` : **10 fichiers**, contrôle CRC sans erreur; l'outil physique est inclus dans l'archive.
- Test de lecture seule `tests/s08-release-readonly-integrity-gate.sql` réexécuté après la CI : **PASS**.
- Compteurs toujours présents TEST : 3 lignes garage_data, 12 soumissions, 6 objets Storage, un seul trigger métier garage_data.
- Security Advisor inchangé : 2 INFO RLS tables privées, 3 WARN RPC timer SECURITY DEFINER, 1 WARN Auth leaked-password protection.

## Comment effectuer l'export autorisé sur TEST
1. Décompresser l'archive autonome sur Windows.
2. Lancer `Demarrer-S08-TEST-Windows.bat` et se connecter **au compte TEST**.
3. Dans Chrome ou Edge (même navigateur et même origine) ouvrir `http://127.0.0.1:8765/audit/s08-physical-backup.html`.
4. Cliquer `Choisir un dossier et sauvegarder`, autoriser un dossier privé et attendre le fichier `manifest.json`.
5. Vérifier le statut `COMPLETE` et conserver ensemble `manifest.json`, `garage-data.json` et `files/`. Ne jamais partager un tel dossier sans protection.

## Limites restantes — **ne pas annoncer 100 %**
- Le vrai téléchargement authentifié des six objets Storage de TEST et une **restauration isolée à partir des vrais octets** ne sont pas encore exécutés. Une archive ou un test simulé n'en est pas la preuve.
- La recette Chrome authentifiée complète SO → BT → facture, paiement partiel et archivage reste à faire sur S08. GitHub Pages public sert toujours `main`, pas S08.
- Le réglage Supabase Auth de protection contre les mots de passe compromis doit être activé/confirmé.
- Le validateur serveur de factures payées est expérimental, toujours non attaché aux sauvegardes réelles, en attente de la recette fonctionnelle.

**Avancement estimé : 97 %, avec un moyen vérifié de réaliser le téléchargement physique une fois le compte TEST ouvert. Aucun octet client n'a été exporté par l'assistant, aucune donnée métier n'a été modifiée.**
