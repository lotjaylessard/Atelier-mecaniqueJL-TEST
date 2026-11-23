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
