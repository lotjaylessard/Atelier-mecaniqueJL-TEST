# S08 — Diagnostic du site publié et prévisualisation isolée (14 novembre 2026)

**Dépôt TEST :** `lotjaylessard/Atelier-mecaniqueJL-TEST`. **Branche de développement :** `s08/soumissions`. **Supabase TEST :** `nraijzsodgojkpyigefu`. **Production :** inchangée.

## Découverte vérifiée : le site TEST public affiche main, PAS S08
Un script `tests/s08-pages-deployment-probe.cjs`, exécuté sur le runner GitHub Actions sans authentification ni accès aux données clients, a comparé les empreintes SHA-256 du HTML servi par `https://lotjaylessard.github.io/Atelier-mecaniqueJL-TEST/` avec les fichiers des branches.

- Réponse Pages : HTTP 200.
- Fichier publié : SHA-256 `83484d3bcb1f4c6dc2572f27a1ad7b6aa0d0d32706cb9f0ae2fdbd405f804ef3`.
- Le HTML publié correspond **octet par octet** au `index.html` de **main** (`same_as_main=true`).
- Le HTML publié diffère de `s08/soumissions` (`same_as_s08=false`) et n'a pas l'avis de récupération S08.
- Le HTML publié pointe toujours vers le projet **Supabase TEST**, donc cette différence de code **n'établit pas une connexion à la production**.

**Conséquence** : il serait incorrect de considérer une recette faite sur l'URL Pages publique actuelle comme une recette du code S08.

## Livraison sans casser la page publiée
- Le workflow `.github/workflows/s08-offline-tests.yml` crée désormais un artefact ZIP de prévisualisation S08 contenant `index.html`, `login.html`, et les trois scripts audit nécessaires.
- Aucun commit n'a été appliqué à `main` ou à la production, et aucun réglage GitHub Pages n'a été modifié.
- L'archive CI de S08 a été téléchargée et vérifiée : ZIP intègre; SHA Git des fichiers principaux concordant avec la branche S08 (`index.html = 663bc494470de9d7e0f3f62f760f7329e8d79df7`, `login.html = 8bb018eb4098246a13325078d6e8fc99a7336f9b`).
- Un ensemble Windows autonome de prévisualisation a été produit dans le conteneur ChatGPT : démarrage d'un serveur HTTP strictement lié à `127.0.0.1:8765`, ouverture automatique de Chrome/navigateur, même origine à chaque démarrage, sans modifier GitHub Pages. Il inclut un README et un lanceur Windows qui utilise Python 3. **Ce lanceur n'a pas été exécuté sur le PC de l'utilisateur.**

## Corrections supplémentaires
- `login.html` utilisait encore `@supabase/supabase-js/+esm` (version flottante). Cette référence a été fixée à `@supabase/supabase-js@2.119.0/+esm`, comme dans le fichier principal.
- Le test `tests/s08-supabase-cdn-version.test.cjs` couvre maintenant la connexion, et la CI est configurée pour s'exécuter lors des changements à `login.html`.
- Un scénario Chromium réel hors ligne `tests/s08-login-chromium-offline.cjs` vérifie le formulaire de connexion avec une API Auth fictive.
- Une exécution Chromium locale via Playwright (avec Auth fictive, dans `page.set_content`) a également confirmé l'affichage du message d'échec de connexion, sans erreur JS.

## Preuves GitHub Actions
- **Run** `43547449723` : `completed`, `conclusion=success`.
- **Node** : 80/80 tests réussis, 0 échec.
- **Deux tests Chromium headless réels** : pièce jointe + récupération du bon compte; formulaire de connexion avec fausse Auth. Les deux étapes ont conclu `success`.
- Attestation `audit/s08-ci-latest.json` : `source_commit=2cb5549ca78df566b6947c97aa08f3ee13d5ee58`, tous les résultats `PASS`.

## Limites toujours ouvertes avant 100 %
1. Recette **authentifiée** avec un compte TEST dans le véritable site S08 (sur origine isolée), y compris SO → BT → facture, paiements, factures payées et fichiers joints.
2. Téléchargement des **octets réels** des objets Storage, contrôle SHA-256 et restauration isolée complète. Ne pas confondre les manifests JSON avec les fichiers.
3. Activation et vérification du réglage Supabase Auth de protection contre les mots de passe compromis.
4. Recette UI puis seulement ensuite activation du verrou serveur des factures payées. Le validateur expérimental reste non attaché aux données réelles.

L'état est **nettement meilleur qu'avant le contrôle de déploiement**, mais le site publié sur main **n'est pas encore** S08. Ne pas fusionner ni redéployer sans recette authentifiée concluante.

**Aucune mutation PROD. Les changements restent confinés à la branche de travail TEST et aux artefacts locaux.**
