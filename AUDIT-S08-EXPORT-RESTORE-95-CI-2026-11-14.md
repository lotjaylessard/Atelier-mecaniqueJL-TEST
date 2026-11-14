# Audit S08 — Sauvegarde physique et restauration isolée préparées (14 novembre 2026)

**Dépôt :** `lotjaylessard/Atelier-mecaniqueJL-TEST`, branche `s08/soumissions`. **Supabase :** projet TEST `nraijzsodgojkpyigefu`. **Production : aucune modification.**

## Réalisé dans cette étape

### Sauvegarde physique vérifiable
- Nouveau `audit/s08-physical-backup.html` : interface opt-in à utiliser avec le compte TEST authentifié sur `http://127.0.0.1:8765`.
- Nouveau `audit/s08-physical-backup.js` : inventorie avec pagination tous les objets sous le préfixe du compte et ajoute les références BT héritées accessibles; télécharge les octets depuis `wo-files`, les écrit dans un dossier choisi sur l'ordinateur, recalcule SHA-256 sur les octets relus du disque, exporte `garage-data.json` (avec notes, factures, BT et soumissions), et crée `manifest.json`.
- La sauvegarde n'est `COMPLETE` que si les fichiers référencés sont présents, si tous les téléchargements réussissent, si les versions de garage/soumission et l'utilisateur restent cohérents et si l'inventaire Storage n'a pas changé pendant l'export.
- Pas de SUPABASE UPDATE/DELETE/UPLOAD ni de restauration automatique. Les dossiers locaux contiennent des données privées.

### Restauration isolée à blanc
- Nouveau `audit/s08-verify-physical-backup.py` : relit un dossier exporté, valide `manifest.json` et `garage-data.json`, refuse les chemins dangereux/doublons, compare les octets et SHA-256 de chaque fichier, recopie les fichiers dans un dossier temporaire et re-vérifie les empreintes. N'écrit jamais dans Supabase et efface ensuite la copie temporaire.
- Nouveau `Verifier-S08-Sauvegarde-Windows.bat` : glisser-déposer le dossier de sauvegarde sur le fichier pour exécuter la validation Python 3.
- README et ZIP autonome de TEST actualisés pour inclure les outils.

### Tests réels en CI
- **Run GitHub Actions `43549918721`**, résultat officiel `completed / success`.
- **95 tests Node, 95 réussis, 0 échec.** Les scénarios incluent SHA-256, références, fichiers manquants ou modifiés, changement de compte/versions, inventaire Storage changeant, et restauration dans un dossier temporaire.
- **3 tests Chromium réels réussis** avec faux cloud/faux Auth : module BT et pièces jointes, formulaire de connexion et page de sauvegarde physique.
- Artefact GitHub n° `14095429079`, `garage-s08-preview-9fdf6b9528db39281dfeb5d2dadf77d4a6ce5b02`, 12 fichiers. ZIP téléchargé vers le conteneur ChatGPT et CRC vérifié sans erreur.
- Workflow testé sur le commit exact `9fdf6b9528db39281dfeb5d2dadf77d4a6ce5b02`.

## Étapes non encore démontrées — bloquants avant 100 %
1. Utiliser **une vraie session du compte TEST** pour exécuter le nouvel outil de sauvegarde et constater `manifest.status=COMPLETE` sur les vrais octets de Storage, puis exécuter le vérificateur local et conserver le résultat PASS. Ne jamais transférer ce dossier privé à GitHub.
2. Recette du parcours complet S08 dans Chrome authentifié (SO → BT → facture → paiement/archivage). Le site GitHub Pages public sert `main`, pas S08 : utiliser la prévisualisation locale.
3. Paramétrer Supabase Auth sur TEST : protection contre les mots de passe divulgués, puis contrôler que l'avertissement est levé.
4. Après recette authentifiée réussie, décider d'activer le verrou serveur des factures payées. Le validateur n'est pas encore branché.
5. Recontrôler tous les points avant toute modification du déploiement public et surtout avant toute promotion en production.

**Avancement estimé : 97 %, sans annonce artificielle de 100 %.** Les fonctions nécessaires au vrai test des octets existent désormais et ont subi les régressions, mais le test avec données réelles demeure à exécuter par un compte autorisé. Aucune donnée métier n'a été écrite ou effacée par l'assistant.
