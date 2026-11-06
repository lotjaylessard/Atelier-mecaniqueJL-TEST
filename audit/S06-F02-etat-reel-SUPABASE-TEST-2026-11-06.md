# S06 — Etat reel Supabase TEST (6 novembre 2026)

Projet **Atelier-mecaniqueJL-TEST**, ref `nraijzsodgojkpyigefu`.
**PRODUCTION garage-mecanik non modifiee**.

## Installe dans TEST (migrations par connexion Supabase)
1. `s06_timer_sessions_secure_table_test` : table `public.garage_timer_sessions`, FOREIGN KEY vers `public.garages` et `auth.users`, index de session active unique par utilisateur, contraintes d'etat et revisions, RLS + FORCE RLS, SELECT sur propre compte et garage, zero droit INSERT/UPDATE/DELETE direct pour `authenticated` / `anon`.
2. `s06_timer_transitions_secure_test` : fonctions `public.s06_timer_check_work_order` (interne, EXECUTE prive) et `public.s06_timer_transition` (EXECUTE seulement authenticated), a partir de la proposition V2 `audit/S06-F02-V2-BT-verification-NE-PAS-EXECUTER.sql`. La proposition reste un document historique, **NE PAS relancer** (elle inclut CREATE TABLE).

## Verifications effectuees reellement sur TEST
- Table creee avec 0 session, RLS true, FORCE RLS true.
- SELECT autorise a `authenticated`, INSERT/UPDATE refuses; SELECT `anon` refuse.
- RPC helper proprietaire postgres, EXECUTE anon/authenticated refuses.
- RPC transitions proprietaire postgres, EXECUTE anon refuse, authenticated autorise.
- Test en session SQL non authentifiee : `create` refusee avec erreur permission 42501, toujours zero session.
- Contrôles precedents : 3 comptes, aucun utilisateur membre de plusieurs garages, 2 garages actifs, 1 ancienne ligne `garage_data` avec `garage_id` NULL, 7 BT (2 ouverts) dans garage avec version 220.
- CSV de `garage_data` exporte par utilisateur : **pas un dump complet PostgreSQL, pas une restauration testee**.
- Alertes d'audit preexistantes sur routines `is_garage_member`, `can_read_garage_file`, protection des mots de passe; ne pas modifier sans evaluation separee.

## Pas encore termine
- Aucun test RPC avec VRAI compte connecte ni deux appareils, pas encore de session persistante creee.
- Fonction atomique `s06_timer_post_labor` **non installee** ; projet SQL dans `audit/S06-F05-posting-atomique-PROPOSITION-NE-PAS-EXECUTER.sql`.
- Profil employe fiable et reconciliation `garage_data.version` / autosave apres la RPC restent a integrer.
- Le HTML `index.html` n'a pas ete modifie lors de ces migrations : minuterie actuelle et panneau de lecture seule toujours inchanges.
- Ne pas activer S06 dans le navigateur avant les tests d'isolation/reprise et l'integration, sans ecriture involontaire dans les BT.
