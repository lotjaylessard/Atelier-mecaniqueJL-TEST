-- S02-7 — CANDIDAT DE MIGRATION. TEST UNIQUEMENT.
-- NE PAS EXECUTER avant la validation de la restauration et du plan de test.
-- Objectif : interdire la suppression automatique du JSON de garage_data
-- lorsqu'un compte lié dans auth.users est supprimé.
--
-- Préconditions :
-- 1. Projet Supabase TEST confirmé : nraijzsodgojkpyigefu.
-- 2. Sauvegarde PostgreSQL ET Storage récente, indépendante, vérifiée.
-- 3. Vérifier qu'aucune gestion de compte automatisée ne dépend du CASCADE.
-- 4. Vérifier que la contrainte actuelle est exactement celle attendue.
--
-- L'instruction ci-dessous NE doit PAS être lancée depuis la production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  current_rule text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO current_rule
  FROM pg_constraint c
  WHERE c.conrelid = 'public.garage_data'::regclass
    AND c.conname = 'garage_data_user_id_fkey'
    AND c.contype = 'f';
  IF current_rule IS NULL
     OR current_rule NOT ILIKE '%REFERENCES auth.users(id)%'
     OR current_rule NOT ILIKE '%ON DELETE CASCADE%' THEN
     RAISE EXCEPTION 'STOP: clé existante inattendue: %', current_rule;
  END IF;
END $$;

ALTER TABLE public.garage_data
  DROP CONSTRAINT garage_data_user_id_fkey;

ALTER TABLE public.garage_data
  ADD CONSTRAINT garage_data_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE RESTRICT;

COMMIT;

-- VÉRIFICATION après validation du changement (LECTURE SEULE) :
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid='public.garage_data'::regclass
-- AND conname='garage_data_user_id_fkey';
--
-- Rollback DDL (UNIQUEMENT sous décision explicite après revue, sur TEST) :
-- BEGIN;
-- ALTER TABLE public.garage_data DROP CONSTRAINT garage_data_user_id_fkey;
-- ALTER TABLE public.garage_data ADD CONSTRAINT garage_data_user_id_fkey
--   FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
-- COMMIT;
--
-- Limites : RESTRICT ne protège pas contre DELETE direct de garage_data,
-- superuser/service_role, ou modifications JSON erronées; auditer RLS DELETE,
-- sauvegardes, journalisation et tests d'isolation en parallèle.
