# S08 — Lanceur autonome reproduit par CI et vérifié (14 novembre 2026)

## Portée
Dépôt TEST `lotjaylessard/Atelier-mecaniqueJL-TEST`, branche `s08/soumissions`; Supabase TEST `nraijzsodgojkpyigefu`. **Production et branche main inchangées.**

## Changement concret
Le lanceur précédemment distribué uniquement dans un ZIP local est maintenant versionné dans la branche TEST :
- `start-s08-preview.py` — serveur HTTP Python lié à `127.0.0.1`, port fixe 8765 sous Windows, port éphémère via `S08_PREVIEW_PORT=0` pour les essais CI; ouverture automatique du navigateur désactivable seulement en mode test via `S08_NO_BROWSER=1`.
- `Demarrer-S08-TEST-Windows.bat` — lance Python 3 depuis le dossier extrait.
- `LISEZ-MOI-S08-TEST.txt` — guide d'usage et avertissement d'utiliser exclusivement des données fictives.
- `tests/s08-preview-local-http.test.cjs` — lance le VRAI serveur Python dans GitHub Actions, effectue des requêtes HTTP sur les cinq ressources du site et vérifie que les deux pages ciblent Supabase TEST, jamais PROD, avec SDK fixé à 2.119.0.
- `.github/workflows/s08-offline-tests.yml` — désormais déclenché aussi pour les changements aux fichiers du lanceur et publie les huit fichiers nécessaires dans un ZIP autonome.

## Preuves CI
Exécution GitHub Actions : `43548321006`, statut `completed`, conclusion `success`; commit testé `7ffb743a2481cca3a10e8f7d4623b41bc63d7874`.
- 81 tests Node, 81 réussis, 0 échec, dont le nouveau scénario HTTP.
- Deux tests Chromium réels hors ligne : pages BT/pièces jointes et formulaire de connexion avec services fictifs. Les deux étapes ont conclu `success`.
- ZIP `garage-s08-preview-7ffb743a2481cca3a10e8f7d4623b41bc63d7874`, artefact GitHub n°`14094687174`, taille 205840 octets, 8 fichiers.
- Archive téléchargée et contrôlée : `testzip=None` (aucune erreur CRC), `index.html` SHA-256 `61f7c6c7a1fe9e5e7aaa96c77e3e5165916b923a770326d5bc11f8cb8da5ef5d`; `login.html` SHA-256 `a21aee8a81e774fc22da4fc377cfd47d80266a969a6b37904f0cb7753d2c4a56`.
- Le navigateur Chromium du conteneur ChatGPT bloque les requêtes HTTP localhost par l'administrateur (`ERR_BLOCKED_BY_ADMINISTRATOR`). Cette limite ne s'applique pas à l'essai HTTP GitHub Actions qui a réussi; aucun résultat Chromium local authentifié n'a été revendiqué.

## Vérification post-déploiement de test
- Contrôle SQL global lecture seule exécuté sur Supabase TEST avec résultat PASS.
- 3 lignes garage_data, 12 soumissions, 6 objets Storage, un seul trigger métier sur garage_data. Le validateur expérimental des factures reste non attaché.
- Security Advisor : 2 INFO (tables privées RLS sans politique), 3 WARN (fonctions privilégiées minuteur authentifiées) et 1 WARN (protection Auth contre mots de passe divulgués).

## Bloquants finaux réels
1. Recette réelle, authentifiée sur l'aperçu S08, sans utiliser le site GitHub Pages public (actuellement il sert `main`).
2. Accès à de vrais octets Storage, comparaison SHA-256 et restauration intégralement isolée.
3. Réglage Auth contre les mots de passe compromis.
4. Recette Chrome avant activation du verrouillage serveur des factures réglées.

**L'ensemble est désormais reproductible sans assemblage manuel, mais n'est pas une preuve de restauration physique ni de connexion réelle. Audit ~97 % : ne pas annoncer 100 %.**
