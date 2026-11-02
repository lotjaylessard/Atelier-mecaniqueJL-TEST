-- S02-10 — CANDIDAT NON EXECUTE, SUPABASE TEST UNIQUEMENT
-- Objectif: bloquer le DELETE direct des lignes garage_data pour authentifiés
-- en préservant SELECT/INSERT/UPDATE requis par l'application.
-- Pas de changement de données ni de RLS dans ce script.
--
-- IMPORTANT: demander une validation humaine et vérifier l'accès applicatif
-- après la modification; une policy ALL ne supplante pas un REVOKE effectif.
-- Vérifier avant application les droits accordés à PUBLIC et les droits hérités.
--
-- CONTROLE PREALABLE (lecture seule)
SELECT
  has_table_privilege('authenticated','public.garage_data','SELECT') AS can_select,
  has_table_privilege('authenticated','public.garage_data','INSERT') AS can_insert,
  has_table_privilege('authenticated','public.garage_data','UPDATE') AS can_update,
  has_table_privilege('authenticated','public.garage_data','DELETE') AS can_delete,
  has_table_privilege('PUBLIC','public.garage_data','DELETE') AS public_delete_grant;

-- MODIFICATION CANDIDATE (NE PAS EXECUTER AVANT APPROBATION)
-- BEGIN;
-- REVOKE DELETE ON TABLE public.garage_data FROM authenticated;
-- COMMIT;
--
-- CONTROLE APRES CHANGEMENT
-- SELECT has_table_privilege('authenticated','public.garage_data','DELETE') AS can_delete;
-- Exiger false; si true, explorer les droits hérités ou PUBLIC avant toute validation.
--
-- LIMITES:
-- - Cela n'affecte pas le rôle service_role, propriétaires SQL ou superutilisateurs.
-- - Cela n'élimine PAS ON DELETE CASCADE de auth.users vers garage_data.
-- - Une policy ALL n'a pas besoin d'être retirée immédiatement si le DELETE
--   est réellement bloqué par les privilèges SQL; examiner INSERT/UPDATE séparément.
-- - Restauration en cas de régression (TEST uniquement, autorisation requise) :
--   GRANT DELETE ON TABLE public.garage_data TO authenticated;
