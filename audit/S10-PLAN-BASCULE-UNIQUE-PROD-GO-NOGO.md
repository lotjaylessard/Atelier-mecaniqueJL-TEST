# Atelier Mécanique JL — S10 : séquence finale de mise en service, NO-GO par défaut

**Version : 2026-11-23 ; répertoire de préparation :** `lotjaylessard/Atelier-mecaniqueJL-TEST`, branche `integration-finale`.

**Ce document n'autorise AUCUNE modification PROD.** Aucun script SQL du dépôt, en particulier `s10-prod-complete-migration-candidate-NOT-EXECUTED.sql` ou le candidat de bascule Storage, ne doit être exécuté avant une approbation explicite.

## Constatations factuelles — lecture seule de la PROD

- Supabase PROD : `feeapfylfzlvgnqtglnh`, ancien modèle `garage_data` (une ligne), pas de tables `garage_members`, `garage_quotes` ni `garage_external_calendar_connections`.
- `wo-files` public ; 55 objets Storage (les six fichiers non référencés doivent aussi être conservés).
- Quatre politiques Storage historiques ; cinq politiques historiques sur `garage_data`. La transition doit les **remplacer**, pas additionner des politiques permissives.
- Aucune Edge Function PROD. Trois fonctions **obligatoires d'après le code web actuel** : `garage-calendar-oauth`, `garage-familywall-calendar`, `garage-outlook-ical`. `garage-microsoft-calendar` n'est pas utilisée actuellement (optionnelle).
- Un ancien dump physique **a déjà été fait sur le portable du bureau** ; ne pas en réclamer une répétition pour une simple recette. Le dump reste un *checkpoint historique*, pas un gel final.
- La simulation GitHub CI a réussi pour la migration complète sur données fictives, la reprise phases 5–10 après phases 1–4, l'isolation SQL et la conversion atomique Storage. Cela ne vaut pas test Auth navigateur.

## Bloc A — avant toute écriture dans PROD

**A1. Reprise de la copie du bureau :** sur le portable du bureau, vérifier la présence du dump, des 55 fichiers et du manifeste; contrôler qu'ils sont lisibles et couvrent la même date. La base `atelier_jl_restore_test` existe déjà et ne doit pas recevoir une deuxième fois les phases 1–4. Exécuter seulement la procédure `audit/s10-run-existing-local-restore-continuation.ps1` lorsqu'on est sur ce portable : elle doit refuser d'écraser `atelier_jl_s10_continuation` si déjà présente.

**A2. Essai isolé de bout en bout :** base et Storage privés, 3 vraies sessions (propriétaire A, employé A, propriétaire B) dans un projet Supabase jetable distinct. Vérifier Auth réel, lecture/écriture RLS, soumission → BT → minuterie → facture → paiement, ancien/nouveau fichier via URL signée, planification et calendriers. Aucun import de données TEST vivantes.

**A3. Identité de l'ami :** documenter le mécanisme d'inscription Auth/membership du garage B, la conservation ou le remappage de ses données, et le sort de sa ligne historique sans `garage_id` dans TEST. Ne rien supprimer ni transférer de TEST sans traitement explicite.

**A4. Source GitHub Pages PROD :** identifier le dépôt/site réellement publié, enregistrer son commit précédent, vérifier son chemin de publication et préparer une sortie réversible du nouveau bundle. Ne pas confondre le dépôt TEST avec le site PROD.

**A5. Autorisation :** demander un GO explicite avec la cible choisie et le moment de gel. Un test CI vert ne constitue jamais ce GO.

## Bloc B — séquence au moment du gel, après A1 à A5

1. Annoncer la fenêtre d'interruption et **geler les écritures des utilisateurs**. Vérifier qu'aucun BT, facture, paiement, timer, pièce jointe ni cache local non synchronisé n'est resté en attente.
2. Refaire uniquement **un checkpoint de fermeture** PROD (données, Auth, politiques, Storage et empreintes de fichiers) car un ancien dump ne contient pas les opérations ajoutées depuis. Conserver les sauvegardes historiques existantes.
3. Assurer le chemin de retour arrière **avant** les écritures : dump frais vérifié, 55+ fichiers actuels selon inventaire à ce moment, état du bucket et politiques, commit web d'origine, variables OAuth et identité de l'administrateur. L'ancien site peut redevenir accessible, mais cela ne restaure pas automatiquement le schéma ni les nouveaux paiements; donc rollback base = restauration séparément vérifiée, pas une simple publication GitHub.
4. Installer le schéma S10 complet sur la **cible approuvée**, pas TEST par défaut. Les anciens `user_id`, clients, véhicules, BT, montants, paiements et pièces jointes doivent être préservés; arrêter si des politiques PROD inattendues existent.
5. Basculer `wo-files` public → privé avec remplacement des politiques **dans une seule transaction BD**, via le candidat `s10-build-atomic-storage-cutover.cjs` préalablement éprouvé. **Limite importante :** le COMMIT SQL ne garantit pas que les téléchargements publics en cache et les URL déjà diffusées perdent immédiatement leur accès; vérifier le comportement réseau réel et les signed URLs. Ne pas promettre une révocation globale instantanée.
6. Configurer les secrets et redirections Google OAuth **dans PROD uniquement**; déployer les trois Edge Functions obligatoires. Ne jamais copier les tokens, clés de chiffrement ou URL ICS TEST. Reconnecter les calendriers personnels dans PROD via le navigateur.
7. Tester le backend PROD réel **avec le site ancien encore inchangé ou une URL de prévisualisation sécurisée**, et l'Auth du garage A et B : tables, RPC, Storage, Edge et parcours métier. Ne pas publier le bundle TEST.
8. Générer le bundle web PROD avec URL/clé **publiables seulement**, contrôler la disparition de toutes références TEST, noms des fichiers et Signed URLs. Le marqueur `NO-GO-PROTOTYPE.txt` interdit la publication automatique : son retrait ne se fait qu'après le GO.
9. Publier le nouveau site sur la cible GitHub Pages identifiée; effectuer la recette navigateur postpublication avec tous les rôles; vérifier factures et paiements du dernier checkpoint.
10. Lever le gel seulement après recette validée. Surveiller les premières créations de BT, soumissions, factures et pièces jointes; noter les incidents et le plan de reprise.

## Refus immédiat / NO-GO

- Un seul des 55 fichiers historiques est absent, de taille différente ou illisible; ou les nouvelles références ont changé depuis le snapshot.
- Absence de test réel des rôles (y compris refus intergarage), des URLs signées ou de la connexion fournisseur.
- Une table, politique ou RPC requise manque; tout mot de passe, secret ou jeton d'un environnement se retrouve dans l'autre.
- Site PROD réel non identifié, utilisateurs encore actifs lors de la bascule, cache local non synchronisé, ou absence de restauration de retour arrière éprouvée.
- Toute erreur de paiement, attribution de garage ou conservation d'identité.

## Distinction des niveaux de preuve

| Partie | Preuve actuelle | Reste nécessaire |
|---|---|---|
| Schéma SQL | CI réel PostgreSQL, données **fictives** | Supabase isolé, Auth et données issues du dump |
| Storage | RLS simulé, transaction SQL réussie | Bytes réels, bucket privé, lecture HTTPS signée, absence de fuite |
| Calendriers | Sources et contrat frontend CI validés | Secrets PROD, callbacks fournisseur, sessions réelles |
| Site web | Bundle PROD de **revue** généré, NO-GO | Recette et publication ciblée |
| Sauvegarde | Historique sur portable bureau | Comparaison à jour + rollback physique démontré |
| Deux garages | Politiques simulées | Vraies sessions + identité de l'ami |

**État présent : NO-GO publication, zéro écriture PROD ou TEST.** 
