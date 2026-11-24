# S10 — Exécution accélérée, deux sources réelles (24 novembre 2026)

**Statut : PRÉPARATION. Aucune autorisation de mutation PROD.**
Objectif : remplacer les micro-tests par **une validation intégrée unique** lors de la fenêtre de bascule.

## Ce qui est acquis — ne plus refaire les anciens contrôles

- Restauration locale SQL historique de l'atelier, 55 objets existants et 1 garage source, confirmée précédemment.
- Projet réel de l'ami `bdrtlveohbjwxcobeysb` vérifié le 24 novembre : **9 clients, 13 véhicules, 16 BT, 15 factures, 3 notes, 8 pièces, 5 services et 19 fichiers/25 255 060 octets**, dont 12 référencés et 7 non référencés.
- Source amie Auth : 1 compte confirmé, fournisseur email, mot de passe configuré.
- L'utilisateur rapporte qu'un **deuxième compte Auth** vient d'être créé dans PROD Atelier. Capture Supabase montrant 2 comptes; **ne pas considérer la liaison garage B comme faite**.
- Simulations GitHub fictives indépendantes pour schéma RLS, application, conversion chemins et Auth. Elles ne remplacent pas la recette avec utilisateurs réels.
- PROD GitHub Pages est sur `main`. Le dépôt actuel contient toujours **une connexion automatique avec identifiants visibles**; le propriétaire a explicitement indiqué que l'ancien mot de passe n'a **pas encore été changé**. **Ne jamais mettre ces identifiants dans des journaux, rapports ou nouveaux commits**.
- Tentative de créer une branche dans GitHub PROD : **403 Resource not accessible by integration**. Préparations et scripts cantonnés à TEST `integration-finale`.

## Action concrète préparée ce jour

- `audit/s10-friend-physical-backup-browser.js` : export local, via une session client authentifiée du **projet source de l'ami**, de **19/19 objets** dans `wo-files` (12 reliés + 7 non reliés), plus `garage-data.json` et manifest contenant SHA-256 par fichier. Aucun upload, aucune écriture Supabase.
- Le garde-fou refuse le mauvais projet Supabase et ne marque `COMPLETE` que si l'inventaire et le JSON restent inchangés pendant le téléchargement. En cas de restrictions Storage empêchant de lire l'objet sans propriétaire, l'export ne sera pas considéré complet : il faudra un autre accès légitime, sans supprimer l'objet.
- `audit/test-s10-friend-physical-backup.cjs` et CI sur **données fictives uniquement**.
- Outil de remappage : `audit/s10-plan-friend-storage-remap.cjs`; outil de fusion de deux lignes isolées : `audit/s10-plan-two-garage-merge.cjs`. Ils ne transfèrent pas automatiquement le moindre octet ni aucun compte.

## Chemin critique unique (dans cet ordre)

1. Récupérer **les octets réels du Storage de l'ami**, dans un dossier privé sur le PC, manifest `COMPLETE`. Pas seulement les métadonnées SQL. Un identifiant `owner_id` manquant sur un objet **ne le rend pas supprimable**.
2. Vérifier par checkpoint final à date de gel la sauvegarde complète des **deux** bases et des **deux** ensembles physiques. La sauvegarde antérieure du propriétaire reste utile mais n'est pas le checkpoint de gel.
3. Construire le paquet local isolé : source Atelier + source Ami + fichiers; valider mappage UID Auth destination B, identité garage A et B, collision des chemins, paiements, montants, nombres et hashes. **Ne jamais importer TEST**.
4. Vérifier les paramètres réels du projet destinataire : comptes Auth existants, modèle des utilisateurs, accès mail/confirmation, Storage RLS, OAuth/Edge Functions et redirection de connexion. Le SQL de migration S10 initial **n'ajoute qu'un seul owner, celui du garage A**; il faudra provisionner B de façon distincte et validée, après migration du schéma.
5. Préparer le déploiement GitHub Pages dans **une branche distincte**, pas `main` tant que non approuvé; préserver `img/login-bg.jpg`. L'accès GitHub en écriture à PROD est actuellement bloqué (403), donc **pas de publication via connecteur à ce stade**.
6. Soumettre au propriétaire **une seule proposition de bascule** contenant sauvegardes, ordre, point de non-retour, estimation d'indisponibilité et actions de rollback. **Obtenir un GO spécifique explicite** pour les opérations PROD et l'accès à la destination. Le mot «next» ne vaut pas cette autorisation.
7. Uniquement durant la fenêtre approuvée : geler les écritures des deux anciens garages, checkpoint, migration du modèle A, import isolé B, fichiers 19/19, comptes et memberships, installation Edge/secrets selon plan, publication site, deux tests de session réelle et de liens signés. Réouverture ou rollback complet.

## Restrictions

- **NE PAS** : supprimer des données TEST, publier le code TEST tel quel, ajouter les JSON et manifests clients dans GitHub, copier les mots de passe Auth, utiliser une clé service_role dans navigateur, effacer les 7 fichiers non reliés, écraser les fichiers de l'atelier, donner l'accès garage A au compte B.
- **Sécurité sans délai** : l'identifiant exposé reste actif tant que le mot de passe n'est pas changé. La publication future du correctif ne fera pas disparaître sa présence dans l'historique Git; une rotation et une révocation des sessions restent nécessaires.
- **Pas de promesse de récupération automatique** : le connecteur Supabase ChatGPT est actuellement autorisé sur l'organisation du garage de l'ami uniquement; il ne peut pas lire les octets Storage via les requêtes SQL d'inventaire. Les originaux restent sur leurs environnements.
