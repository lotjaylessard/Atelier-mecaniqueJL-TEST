# S10 — Écart SQL réel TEST / PROD (lecture seule, 2026-11-23)

## État confirmé par information_schema.columns

PROD Supabase `feeapfylfzlvgnqtglnh` : **1 table applicative** `garage_data` (3 colonnes : `user_id uuid NOT NULL`, `data jsonb NOT NULL`, `updated_at timestamptz NULL`).

TEST Supabase `nraijzsodgojkpyigefu` : **12 tables applicatives**, soit :
- `garage_data` (5 colonnes; ajout `garage_id uuid NULL`, `version bigint NOT NULL`; `updated_at NOT NULL`)
- `garages` (3)
- `garage_members` (4)
- `garage_quotes` (10)
- `garage_timer_sessions` (12)
- `garage_calendar_notes` (7)
- `garage_schedule_events` (13)
- `garage_external_calendar_connections` (10)
- `garage_external_calendar_events` (13)
- `garage_external_calendar_tokens` (5)
- `garage_external_oauth_states` (7)
- `garage_familywall_feed_secrets` (5)

**Bloqueur :** l'interface TEST ne peut pas être déployée directement contre la base PROD actuelle.

## Étapes requises avant tout GO

1. Export/sauvegarde physique complète de PROD et restauration effective dans un environnement isolé; aucune donnée TEST.
2. Capturer **les définitions exactes** des tables, contraintes, index, fonctions, triggers, grants, RLS et Storage de TEST. Le nombre de colonnes seul ne suffit pas à produire une migration sûre.
3. Écrire une migration SQL **additive** qui préserve `garage_data` PROD, crée les tables manquantes et prévoit une transition vérifiée vers `garage_id` / `version`, sans écraser le JSONB métier existant.
4. Exécuter cette migration **uniquement sur une restauration isolée de PROD**, tester comptes, permissions, données, pièces jointes, calendriers et rollback.
5. Préparer les Edge Functions (aucune en PROD actuellement), les secrets et URLs OAuth de PROD; valider les sources cloud actives.
6. Après tests réussis et autorisation explicite du propriétaire seulement : migration PROD avec fenêtre et rollback documentés.

**NO-GO : aucune commande DDL ni écriture PROD autorisée à cette étape.**
