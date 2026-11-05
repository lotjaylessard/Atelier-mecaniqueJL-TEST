-- S06 — VERIFICATIONS APRES INSTALLATION SUR UNE BASE JETABLE UNIQUEMENT.
-- Ce fichier est EN LECTURE SEULE. Ne pas lancer sur une base qui n'a pas
-- recu la V2 dans un environnement jetable : certains SELECT retourneront vide.
-- Il ne valide pas les RLS utilisateur sans sessions authentifiees.

-- 1. Presence et RLS de la table
SELECT n.nspname AS schema, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='garage_timer_sessions';

-- 2. Droits de table : anon/authenticated n'ont aucune ecriture directe
SELECT
 has_table_privilege('anon','public.garage_timer_sessions','SELECT') AS anon_select,
 has_table_privilege('anon','public.garage_timer_sessions','INSERT') AS anon_insert,
 has_table_privilege('anon','public.garage_timer_sessions','UPDATE') AS anon_update,
 has_table_privilege('anon','public.garage_timer_sessions','DELETE') AS anon_delete,
 has_table_privilege('authenticated','public.garage_timer_sessions','SELECT') AS auth_select,
 has_table_privilege('authenticated','public.garage_timer_sessions','INSERT') AS auth_insert,
 has_table_privilege('authenticated','public.garage_timer_sessions','UPDATE') AS auth_update,
 has_table_privilege('authenticated','public.garage_timer_sessions','DELETE') AS auth_delete;

-- 3. Fonctions privilegees : helper inaccessible a l'API; transition auth uniquement
SELECT p.proname, p.prosecdef AS security_definer,
       p.provolatile AS volatility, pg_catalog.pg_get_userbyid(p.proowner) AS owner,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       p.proconfig
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
  ('s06_timer_check_work_order','s06_timer_transition')
ORDER BY p.proname;

-- 4. Politique SELECT (doit limiter user_id=auth.uid())
SELECT policyname, cmd, roles, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname='public' AND tablename='garage_timer_sessions'
ORDER BY policyname;

-- 5. Contrainte d'une seule session active par utilisateur
SELECT indexname,indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname='public' AND tablename='garage_timer_sessions'
ORDER BY indexname;

-- 6. Aucun contenu de garage ou information personnelle affiche.
-- TESTS MANUELS OBLIGATOIRES avec deux vrais comptes auth, dans une base JETABLE :
-- A. Compte A lit A mais pas B; compte B lit B mais pas A.
-- B. anon ne peut ni lire les sessions ni appeler s06_timer_transition.
-- C. authenticated ne peut pas INSERT/UPDATE/DELETE directement.
-- D. Demarrer sur BT inexistant, termine ou facture -> refuse.
-- E. Deux appareils demarrent en meme temps -> un seul succes.
-- F. Revision stale -> echec, pas de modification.
-- G. Fermeture brutale >60s -> temps arrete au dernier heartbeat confirme.
-- H. Session encore active sur autre appareil -> recover refuse.
-- I. BT facture entre creation et start -> start refuse.
-- J. Apres facturation, heartbeat/pause -> aucune main-d'oeuvre creee.
