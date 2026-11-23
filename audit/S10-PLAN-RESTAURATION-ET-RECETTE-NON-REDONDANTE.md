# S10 — Recette finale non redondante et restauration isolée

Statut : procédure préparée, **aucune restauration exécutée**. Branche `integration-finale` seulement. Ne jamais écrire en PROD sans autorisation explicite.

## Ne pas recommencer
Les registres `MIGRATION-MULTIGARAGE-VALIDATION.md`, `S09-SOUMISSIONS-COLLABORATION.md` et `S10-RECETTE-FINALE-GO-NOGO.md` documentent déjà les tests SQL RLS, minuterie, soumissions, Storage et les simulations de sauvegarde propriétaire. Ces validations sont acquises tant que le code, les policies et les fonctions concernées ne changent pas.

## Lacune vérifiée du dispositif de sauvegarde
- `s08-physical-backup.js` produit `garage-data.json`, les objets `wo-files` et `manifest.json`; il contrôle la stabilité des données pendant l'export.
- `s08-verify-physical-backup.js` revérifie les empreintes SHA-256 et les comptages **sur disque seulement**. Il ne restaure pas de base de données.
- Les sessions `garage_timer_sessions` ne sont pas incluses dans ce format d'export. Décider si leur historique est indispensable avant de déclarer une sauvegarde exhaustive. Ne pas modifier le format sans test de compatibilité.
- Le JSON garage peut inclure clients, véhicules, BT, factures et calendriers locaux, mais une restauration doit vérifier ces liens; les secrets d'intégration externe et les comptes Auth ne sont pas couverts par le format actuel.

## Recette navigateur minimale, une seule fois
1. Connexion réelle propriétaire A / employé A / propriétaire B, puis reconnexion; constater accès même garage et refus autre garage.
2. Une soumission TEST créée et planifiée, convertie en BT, minuterie, pièce, facture et paiement; visibilité autorisée et isolation entre garages.
3. Un rendez-vous annulé/replanifié; une pièce jointe téléchargée par le collègue via lien signé; aucun accès du garage B.
4. Sauvegarde physique propriétaire sur ordinateur compatible, manifeste COMPLETE, vérification locale SHA-256; ne jamais utiliser des données TEST pour alimenter PROD.

## Restauration isolée — critères d'acceptation
1. Préparer une base/projet **jetable**, sans connexion aux utilisateurs ni au site de production; prendre les identifiants d'un environnement distinct.
2. Vérifier `manifest.json` COMPLETE et `s08-verify-physical-backup.js` : `ok=true`, empreintes correctes, aucune référence manquante.
3. Restaurer dans l'environnement jetable avec une procédure explicite adaptée au schéma; remapper les identifiants et memberships uniquement si nécessaire, sans écraser de données existantes.
4. Comparer nombre de garages, soumissions, clients, véhicules, BT, factures, paiements, montants et références de fichiers au snapshot original; restaurer chaque objet Storage, comparer octets et SHA-256.
5. Tester lecture réelle d'une pièce jointe, visibilité owner/employee et refus intergarage dans cet environnement.
6. Enregistrer résultats, écarts et procédure de retour arrière. **NO-GO** si restauration incomplète, fuite intergarage ou perte financière.

## Préparation migration de l'autre garage
- Inventaire source en lecture seule, identité du propriétaire, employés, garage, clients, véhicules, BT, factures, paiements, soumissions, fichiers et chemins historiques.
- Définir mapping des IDs et de l'auteur, préserver les numéros, montants zéro, dates et statuts; ne jamais importer les données fictives de TEST.
- Sauvegarder les deux sources, rapprocher tous les comptages, puis demander le feu vert explicite avant toute écriture PROD.

## Déclencheurs de nouveaux tests
Refaire un test SQL uniquement si sa fonction/policy a changé ou si une anomalie concrète est observée. Les tests navigateur et restauration ci-dessus ne sont **pas** des répétitions des simulations SQL.

**État :** documentation prête; navigateur réel, export physique et restauration restent à exécuter. Production intacte.

## Vérification automatique S08 — 2026-11-22
- [x] Workflow `.github/workflows/s08-physical-verifier.yml` exécuté sur `integration-finale` : GitHub Actions run 45105615523, conclusion **success**, commit `fa763ed5`.
- [x] Huit scénarios unitaires du vérificateur de sauvegarde passés en environnement Node.js, sans Supabase ni données réelles.
- [ ] Toujours requis : export physique en navigateur, vérification d'un vrai dossier, restauration isolée et rapprochement métier. Le test unitaire n'atteste pas une sauvegarde réelle.

## Contrôle de divergence des branches — 2026-11-22
- [x] Comparaison GitHub `main...integration-finale` : **ahead 805, behind 0**, statut `ahead`; 170 fichiers modifiés/ajoutés/supprimés dans le diff.
- [x] `index.html` comporte **11 434 lignes ajoutées/supprimées** au total dans le diff; ce chiffre mesure l'ampleur du changement, pas le nombre de bugs.
- [x] GitHub indique une branche sans divergence (fusion fast-forward techniquement possible), **mais aucune fusion n'est autorisée par cette constatation**.
- [ ] Avant fusion, recette réelle et restauration isolée toujours obligatoires; préserver une référence exacte de commit, faire un diff de déploiement et garder un retour arrière vérifiable.
- [ ] Ne pas confondre GitHub `main` de TEST avec le dépôt/site de production; vérifier la cible exacte avant tout déploiement.


## Écart bloquant confirmé — couverture des tables SQL (23 novembre 2026)

Lecture seule du schéma et des comptages Supabase **TEST** : l'export physique `audit/s08-physical-backup.js` couvre `garage_data`, `garage_quotes` et les objets Storage, mais **n'exporte pas** les tables relationnelles du minuteur et de l'horaire.

Comptages TEST au moment du contrôle : `garage_timer_sessions` 10, `garage_calendar_notes` 6, `garage_schedule_events` 1, `garage_external_calendar_connections` 3, `garage_external_calendar_events` 828, `garage_external_calendar_tokens` 1, `garage_familywall_feed_secrets` 2, `garage_external_oauth_states` 4.

**Décision : NO-GO sauvegarde/restauration complète.** Prioriser une sauvegarde/restauration tenant-scoped des sessions minuteur, notes et événements de planning, avec contrôle des propriétaires, IDs et nombres. Pour les connexions externes, distinguer les événements dérivés (re-synchronisables) des paramètres nécessaires à la reconnexion. Ne jamais inclure les tokens OAuth, secrets iCal ou états OAuth bruts dans une archive locale non chiffrée : prévoir réautorisation ou sauvegarde chiffrée avec procédure dédiée. Aucune modification PROD ou SQL n'a été effectuée lors de ce contrôle.


## Décision de périmètre confirmée par le propriétaire — 23 novembre 2026

**Ne migrer AUCUNE donnée métier provenant de Supabase TEST vers PROD.** La branche `integration-finale` est la source du **code** et des améliorations, pas une source de clients, véhicules, BT, factures, paiements, soumissions, fichiers ou historiques réels.

- **Source des données métier à conserver :** la production actuelle, après sauvegarde vérifiée et inventaire de ses données. Les données du garage de l'ami feront l'objet d'une importation distincte, explicitement autorisée et cartographiée.
- **Source du code :** les modifications TEST validées, avec revue des paramètres d'environnement et de connexion pour éviter toute référence au projet Supabase TEST dans le site publié.
- **Destination des données TEST :** aucune. Conserver temporairement l'archive privée TEST uniquement comme preuve d'essai et de restauration en bac à sable, jamais comme charge utile d'import PROD.
- **Anomalie TEST identifiée :** BT `1793673104406` avec `clientExists=true`, `vehicleExists=false`, une facture liée et un `vehicleId` différent. **Hors périmètre de migration PROD** ; aucune correction, suppression ou réaffectation nécessaire sur les données TEST pour déployer le code.
- **Garde-fou de mise en production :** aucun script ne doit faire `INSERT`/`UPDATE`/`UPSERT` depuis `garage-data.json` TEST ou son archive; aucune copie de la table `garage_data` TEST vers PROD. Ne pas réutiliser les sessions, tokens OAuth ou identifiants de TEST.
- **Validation encore nécessaire :** sauvegarde complète et test de restauration **des données PROD**, adaptation des schémas et RLS au code nouveau, vérification des relations clients/véhicules/BT/factures et des fichiers sur une copie isolée de PROD, puis tests navigateur et autorisation finale. Le staging local de l'archive TEST PARTIELLE ne satisfait pas ce critère.

État GitHub en lecture seule au 23 novembre : `integration-finale` en avance de 870 commits sur `main`, sans retard, 190 fichiers modifiés. Cette comparaison ne constitue **pas** une autorisation de fusion ou de déploiement.
