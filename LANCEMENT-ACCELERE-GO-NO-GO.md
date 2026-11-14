# Plan accéléré de mise en service — Garage Atelier Mécanique J.L.
Date : 2026-11-13. Branche de préparation : `s08/soumissions`. Production existante : NE PAS MODIFIER SANS VALIDATION.

## Décision
Sortir de la boucle des tests synthétiques S08. La CI actuelle (commit `9fdf6b9528db39281dfeb5d2dadf77d4a6ce5b02`) confirme 95 tests Node et 3 scénarios Chromium hors ligne réussis. Cela ne valide PAS le parcours complet sous authentification réelle.

## Conditions GO/NO-GO (indispensables uniquement)
1. **Sauvegarde récupérable** : export JSON du garage existant et copie physique des pièces jointes, avec fichiers relus/empreintes SHA-256 et vérification de restauration isolée. Conserver l'original et sa copie hors-ligne.
2. **Recette humaine rapide du vrai site S08 TEST** : connexion réelle, soumission → BT → facture, taxes, paiement partiel/total, verrouillage facture payée, déconnexion/reconnexion, ajout/consultation d'une pièce jointe fictive. Échec bloquant : perte de données, suppression/modification d'une facture payée, accès croisé entre utilisateurs, erreurs de synchronisation.
3. **Compte ami isolé** : créer/valider son identité Supabase Auth, confirmer qu'il obtient son propre garage vierge et que les règles RLS bloquent l'accès aux clients, devis, BT, factures et fichiers de l'autre compte. Ne pas déplacer les données de l'utilisateur actuel dans le compte de l'ami.
4. **Publication contrôlée** : GitHub Pages du dépôt TEST sert encore `main`, pas `s08/soumissions`. Avant toute promotion, conserver sauvegarde et copie du `main` antérieur, déployer une révision identifiée, contrôler le HTML réellement servi, faire une mini-recette après mise en ligne. En cas d'échec, remettre l'ancienne révision du site, sans supprimer les données Supabase.
5. **Ne PAS activer** le trigger expérimental de factures payées avant recette Chrome; la protection contre mots de passe compromis Supabase Auth reste un avertissement à traiter avant une ouverture élargie.

## Ordre d'exécution le plus rapide
- **Étape A :** sauvegarder, tester une fois le parcours complet avec un vrai compte TEST, et prouver l'isolation du compte ami.
- **Étape B :** publier le code TEST contrôlé, vérifier l'empreinte du site servi, puis inviter l'ami sur son garage isolé.
- **Étape C :** corriger les problèmes NON bloquants et reprendre les améliorations demandées (prix de vente pièces/main-d'œuvre, ergonomie) après lancement.

## État présent
**NO-GO pour migration des données réelles aujourd'hui** tant que la sauvegarde physique et les essais authentifiés ne sont pas attestés. Le taux « 97 % » n'est qu'une estimation de l'audit, pas une certification de mise en service. L'objectif devient la levée des 2 à 3 prérequis de lancement, et non l'augmentation arbitraire d'un pourcentage.
