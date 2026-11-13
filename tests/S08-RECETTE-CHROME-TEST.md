# S08 — Procédure de validation navigateur TEST, avant clôture

Branche : `s08/soumissions`. Projet cloud : TEST seulement. **Ne jamais utiliser la production** et ne pas laisser les scénarios de test toucher des factures réelles.

## Préparation
- Confirmer l'URL de TEST (référence Supabase : `nraijzsodgojkpyigefu`), l'identité du compte TEST et une sauvegarde préalable vérifiée.
- Ouvrir Chrome dans un profil distinct, lancer les outils de développement (console et réseau).
- Prévoir un compte de second propriétaire pour vérifier que ses données ne sont jamais visibles.
- Utiliser des clients, véhicules, pièces, services, SO, BT et factures **fictifs**.

## Parcours de recette
1. **Connexion / récupération** : ouverture de TEST, chargement du garage, rafraîchissement, fermeture/réouverture et reconnexion. Aucune disparition de notes ou de données.
2. **Soumission obligatoire** : créer une SO fictive, éditer des lignes, changer les statuts, trier, enregistrer puis rouvrir. Vérifier que la page détail s'ouvre après sauvegarde.
3. **SO vers BT** : approuver la SO avec client et véhicule préremplis; vérifier qu'aucune nouvelle sélection n'est exigée. Contrôler numéro et références SO/BT, description et kilomètres.
4. **Services et pièces** : ajouter/edit inline, coûtant vs vente, numéro de pièce, temps du minuteur et reprise après fermeture (si scénario sûr pour le test).
5. **BT vers facture** : générer une facture, vérifier taxes TPS/TVQ indépendantes, remise, numéro, client, véhicule et total. Vérifier aussi le refus en cas de conflit de version entre deux onglets.
6. **Paiement partiel** : enregistrer une somme inférieure au solde, rouvrir, ajouter le montant restant, vérifier l'historique, le statut et les méthodes.
7. **Facture payée** : interdiction d'édition et de suppression via UI, archivage normal possible, archivage impossible pour facture partielle. Ne pas modifier des factures historiques existantes.
8. **Pièce jointe** : joindre un fichier fictif, afficher miniature, ouvrir, recharger. Vérifier que l'ancien fichier partagé, lorsqu'il est présent dans un BT, reste visible uniquement à l'utilisateur autorisé.
9. **Isolation** : vérifier que le second compte ne voit ni clients, ni notes, ni soumissions, ni factures, ni fichiers du premier.
10. **Export / import** : exporter JSON, lire le résumé et l'intégrité, vérifier les notes et les 7 tableaux, constater explicitement que les binaires sont exclus. L'import doit rester en **inspection seulement**.

## Conditions de refus
- Erreur JS ou réseau inexpliquée, données en double/manquantes, paiement incohérent, perte de fichier, accès étranger, modification de factures payées.
- Si un tel problème survient, garder la branche TEST et les données de production inchangées, noter le scénario reproductible et corriger chirurgicalement avant nouvelle validation.

## Blocages distincts, non validés par les tests SQL
- Téléchargement authentifié des octets réels des fichiers et SHA-256.
- Restauration isolée de tous les binaires et données JSON.
- Confirmation du résultat GitHub Actions.
- Activation et vérification de la protection Auth des mots de passe compromis.
- Activer le vrai verrou serveur de facture payée **seulement** après avoir réussi les scénarios ci-dessus et les tests SQL de prévisualisation.

## Preuves à conserver
URL/branche/commit de TEST, résultat de chaque scénario, logs utiles, aucun secret, et nouvelle exécution du fichier `tests/s08-release-readonly-integrity-gate.sql`.

**Ne pas conclure à 100 % avant ces preuves.**
