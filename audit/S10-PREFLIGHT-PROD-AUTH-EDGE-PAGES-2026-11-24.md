# S10 — Vérification des prérequis de publication PROD (24 novembre 2026)

**État : NO-GO. Lecture seule des services PROD, aucune mutation PROD/TEST.**

## Constats vérifiés pendant cette séance

- Supabase PROD `feeapfylfzlvgnqtglnh` : `list_edge_functions` retourne **0 fonction**. Les modules Google OAuth, FamilyWall et Outlook ICS ne peuvent donc pas être présumés opérationnels après la publication du nouveau site.
- Supabase PROD : `get_publishable_keys` confirme une clé `sb_publishable_` **active** (`default`) et une clé historique anon **active**. Aucun secret n'est recopié dans ce document. Le constructeur `audit/s10-build-production-candidate.cjs` requiert la clé publiable PROD et refuse celle de TEST.
- Les **trois sources** `audit/edge-candidate/garage-calendar-oauth/index.ts`, `garage-familywall-calendar/index.ts` et `garage-outlook-ical/index.ts` existent sur `integration-finale`. Chaque source contient une vérification d'utilisateur via `/auth/v1/user` et référence `GOOGLE_CALENDAR_ENCRYPTION_KEY_HEX`; aucune ne contient les identifiants littéraux des projets TEST/PROD inspectés.
- La quatrième source Microsoft OAuth n'est pas requise par le frontend courant; Outlook utilise ICS.
- La requête GitHub REST `/pages` via le connecteur GitHub n'est pas acceptée (endpoint non autorisé). **L'URL effectivement publiée, branche/dossier de Pages et le rollback via Pages ne sont toujours pas vérifiés**, même si le dépôt PROD est identifié.
- La restauration SQL locale réelle phases 1–10 a déjà réussi sur le portable du bureau; ne pas répéter cette phase.
- Les tests GitHub Actions ont passé les règles d'écritures RLS, minuterie et RPC de facturation **sur PostgreSQL fictif**. Ils ne prouvent pas les connexions OAuth, les fichiers via HTTPS signé ni une recette navigateur complète.

## Conditions de passage à GO, regroupées

**Avant gel et sans écriture PROD :**
1. Vérifier source/URL GitHub Pages du site habituel, ainsi que l'accès au déploiement/rollback web.
2. Valider un parcours réel authentifié propriétaire + employé + deuxième propriétaire; faute d'environnement isolé complet, assumer explicitement les limites et conserver NO-GO.
3. Préparer séparément des **secrets PROD uniques** et l'autorisation du callback Google exact : `https://feeapfylfzlvgnqtglnh.supabase.co/functions/v1/garage-calendar-oauth`. Ne pas transférer les secrets, tokens ni ICS privés de TEST.
4. Définir et éprouver la stratégie des URL signées et Storage privé avec un vrai fichier et une vraie session, dans un projet isolé, pas dans TEST vivant.
5. Confirmer le devenir du garage et du compte de l'ami; ne jamais supposer qu'une base TEST existante sera remplacée.
6. Préparer un plan de retour arrière complet (DB, Storage, code web) et une fenêtre de gel **estimative 15–30 min à revalider**, sans garantir ce délai. Le snapshot historique du portable n'est pas le checkpoint final.

**Après avertissement détaillé, fenêtre choisie et GO explicite seulement :**
1. Geler les écritures et synchroniser les navigateurs; effectuer le checkpoint PROD frais.
2. Valider checkpoint/rollback, appliquer schéma puis bascule atomique Storage.
3. Configurer les variables PROD, autoriser OAuth et déployer les trois Edge Functions.
4. Vérifier les vraies sessions, données de plusieurs garages, fichiers HTTPS signés, calendriers et paiements avant publication du site puis lever le gel.

**Aucune des étapes nécessitant une écriture PROD n'est autorisée par un « next » ou « go » générique.**
