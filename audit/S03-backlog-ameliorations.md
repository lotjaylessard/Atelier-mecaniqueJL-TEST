# S03 — Registre des corrections et améliorations (liste initiale)

**Source :** demandes de l'utilisateur, 2026-11-02. **Statut :** backlog — aucune fonctionnalité ci-dessous n'est déclarée implémentée ou testée par ce fichier.

**Règles :** TEST d'abord, ne pas toucher PRODUCTION; sauvegarde + tests réels avant modifications risquant les données. Ne pas lancer de migration tant que les points bloquants de cohérence et sécurité ne sont pas validés. Les demandes peuvent être précisées et enrichies.

## P0 — Intégrité des données / bogues fonctionnels (avant migration)

- [ ] **S03-F01 — Factures : paiements partiels.** Lors de chaque paiement, choisir **Comptant, Virement, Carte, Non spécifié ou Autre**. Enregistrer le mode *sur chaque entrée de l'historique*, l'afficher dans le résumé/impression si pertinent, maintenir date/montant/solde/statut. Préserver les paiements historiques sans mode (non spécifié, ne pas inventer). Auditer paiements finaux et partiels, taxes, arrondis et paiements cumulés.
- [ ] **S03-W01 — BT terminé : idempotence.** Quand un BT est déjà « terminé », ne pas pouvoir l'achever une deuxième fois ni créer de doublon. Masquer/désactiver le bouton ou traiter l'action comme sans effet. Tester historiques, suppression et liens à facture.
- [ ] **S03-W02 — Kilométrage initial d'un BT.** À l'ouverture d'un BT, afficher le kilométrage actuel connu du véhicule et synchroniser correctement les mises à jour, y compris données historiques et valeurs absentes. Ne jamais écraser un kilométrage plus récent par erreur.
- [ ] **S03-ID01 — NIV/VIN dans BT et factures.** Afficher le NIV du véhicule lié, sans créer de fausse correspondance pour les données anciennes; vérifier écran, impression et archives.

## P1 — Recherche, affichage et comptes (à planifier pendant S03)

- [ ] **S03-UI01 — Tri par colonne + recherche.** Dans Work Orders, Factures, Clients, Véhicules, Services, Pièces, Historique et Notes : tri A→Z / Z→A sur les colonnes pertinentes, tri chronologique/numérique là où applicable, recherche qui affine les résultats à mesure de la saisie. Tester accents, montants, dates et conservation des filtres; adapter les vues sans tableau.
- [ ] **S03-AUTH01 — Accueil personnalisé.** Afficher « Bonjour, [rôle] [nom] » à la connexion (patron/boss, technicien, aviseur, et futurs rôles). *Avant implémentation*, définir stockage fiable des rôles par garage et autorisations côté Supabase : un rôle d'affichage seul n'accorde aucun droit.
- [ ] **S03-AUTH02 — Mot de passe oublié.** Ajouter un parcours sécurisé de réinitialisation de mot de passe Supabase Auth depuis login.html : email de récupération, URL de redirection autorisée, validation du retour, mise à jour du mot de passe, messages neutres qui n'exposent pas l'existence d'un compte.
- [ ] **S03-DB01 — Tableau de bord.** Corriger le libellé « revenu » utilisé pour les dépenses (vérifier dans quel indicateur et ce qui est réellement calculé) et afficher un total « Year to Date » pour la section visée (définir la mesure et l'année civile).
- [ ] **S03-UI02 — Tableau de bord : raccourcis.** Retirer les boutons de raccourcis inutiles en bas du dashboard en conservant la navigation principale.

## P2 — Expérience et intégrations (peuvent suivre les sauvegardes/migration si indépendants)

- [ ] **S03-UI03 — Mode sombre/clair.** Ajouter interrupteur en haut à droite près de « MENU »; conserver la préférence par utilisateur (décider stockage local/cloud), assurer contraste et compatibilité des tableaux, fenêtres, impressions.
- [ ] **S03-UI04 — Refonte visuelle.** Palette, typographie, espacement, états et lisibilité plus professionnels, sans régression fonctionnelle.
- [ ] **S03-CAL01 — Calendrier hebdomadaire.** Afficher semaine courante du Google Calendar dans le dashboard si possible. Choisir intégration/authentification OAuth appropriée, confidentialité des événements par utilisateur/garage, autorisations minimales; aucun secret dans GitHub Pages.

## Exécution et validation

1. Revue du code actuel par module et scénarios risqués, puis modifications sur branche de travail **TEST**.
2. Contrôles automatisés (régression) et tests manuels ciblés sur données fictives TEST.
3. Sauvegardes récentes des projets source/destination, vérification restauration, comparaison de toutes les données et fichiers avant migration d'essai.
4. Aucun changement de la production ou du projet source de l'ami sans autorisation explicite, jamais de suppression des originaux.

**Note :** cette liste est un début; l'utilisateur enverra d'autres demandes.
