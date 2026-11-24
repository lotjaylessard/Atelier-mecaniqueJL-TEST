# S10 — Jalon: script SQL complet exécuté en environnement fictif isolé

Date : 2026-11-23 (soirée Québec); CI le 2026-11-24 00:39 UTC.
Exécution GitHub Actions : https://github.com/lotjaylessard/Atelier-mecaniqueJL-TEST/actions/runs/45298879616
Commit validé : `44edd862b415e46478f58c6864cebab329fc84a3`.

## Faits vérifiés
- 3 jobs GitHub Actions réussis : contrôle statique, migrations phases 1–4, et **script S10 complet** sur une seconde base PostgreSQL 17 jetable.
- Le job complet applique le vrai `audit/s10-prod-complete-migration-candidate-NOT-EXECUTED.sql` dans une base CI `atelier_jl_restore_test` contenant seulement un utilisateur fictif, 42 clients fictifs, 88 BT fictifs, 87 factures fictives, 55 lignes métadonnées de fichiers fictifs.
- Stubs CI pour les rôles `anon` et `authenticated` et `auth.uid()`, **sans session JWT réelle**.
- Création réussie des tables, fonctions, RLS, triggers et autorisations SQL du candidat dans le clone fictif; transaction COMMIT réussie.
- Empreinte MD5 du JSON métier avant/après identique. Vérifiés aussi : propriétaire et garage uniques, métadonnées de 55 objets, existence des RPC minuterie et conversion de soumission.
- Le job 1–4 a validé 49 références avec 0 objet absent, 0 import de données TEST et RLS activé sur les nouvelles tables.
- Aucune opération CI n'a été exécutée contre Supabase PROD ou TEST, aucun fichier binaire ni donnée personnelle importé.

## Limites / vrais blocages à résoudre
1. **Restauration complète des vraies données PROD en projet Supabase isolé**, en préservant les 55 binaires, les UUID historiques, les sommes, paiements et données hors ligne non synchronisées. La restauration PowerShell PostgreSQL précédente existe déjà; son code retour 1 et les objets Supabase gérés ne prouvent pas une restauration complète.
2. **RLS et Auth réels** owner/employee/second garage, pas des stubs SQL. Comprend nouvelles RPC, stockage privé, liens signés et prévention des fuites.
3. **4 Edge Functions PROD** actuellement absentes, secrets de chiffrement propres au projet, redirections OAuth et reconnexion des calendriers; candidat GitHub vérifié mais pas déployé.
4. **Recette navigateur réelle** de soumission→BT→minuterie→facture→paiement, images et calendriers, puis choix du site GitHub Pages PROD et autorisation de la bascule.
5. **Deux projets Supabase visibles seulement**, aucun branch Supabase existant. Créer projet ou branche peut engendrer des coûts : ne pas le faire sans autorisation/cost confirmation.

## Décision opérationnelle
Conserver PROD et TEST intacts; ne pas nettoyer TEST, ni exécuter le script complet dans un projet existant. Ne pas annoncer GO sur la seule base des tests CI fictifs. Le prochain vrai jalon est l'essai intégral **avec une copie physique réelle** et les droits Supabase, pas davantage de tests statiques.
