# S06-F03 : diagnostic de connexion Supabase dans index.html (TEST)
Date : 6 novembre 2026.

## Ce qui est intégré
- Mode inactif par défaut, avec activation explicite via `?s06_readonly=1` dans l'URL du site TEST.
- Encadré bleu au bas à droite, bouton **Actualiser les sessions** et bouton **Fermer**.
- Sur clic, le script récupère le vrai utilisateur depuis `garageSupabase.auth.getUser()`, lit au maximum 15 sessions de `garage_timer_sessions` filtrées par `user_id`, affiche le nombre et quelques métadonnées sans injection HTML.
- Aucune commande `rpc`, `insert`, `update`, `delete`, aucun heartbeat, aucune session créée, aucune intervention sur la minuterie existante, les BT ou les factures.
- Tests `audit/test-s06-readonly-integration.cjs` exécutés dans GitHub Actions avec le reste de la suite.

## Comment tester dans Codespaces
- `git pull` sur la branche `s06/minuterie-persistante`, `Ctrl+F5`.
- Ajouter `?s06_readonly=1` à l'URL du site TEST, après la route `index.html` (si elle existe). Cliquer sur **Actualiser les sessions**.
- Résultat prévu actuellement : `0 session(s) visibles pour ce compte.`
- Fermer en cliquant sur **Fermer**, ou retirer le paramètre de l'URL. Aucun effet durable.

## Étapes restantes
- Connecter réellement l'adaptateur RPC (`audit/s06-timer-client.cjs`) à une UI distincte et à une vraie session authentifiée, derrière opt-in et protections de synchronisation.
- Tests multi-appareils, perte réseau, authentification, gestion des conflits et états des BT.
- Finaliser l'ajout de main-d'oeuvre + note technique atomique et le nom d'employé fiable, avant remplacement des boutons historiques.
