# S06-F06 — Minuterie simplifiée dans les BT (pilotage TEST)

Branche `s06/minuterie-persistante`. **Production inchangée.** Date : 6 novembre 2026.

## Modifications réelles
- Fonction `public.s06_timer_post_labor` migrée dans Supabase **Atelier-mecaniqueJL-TEST** (`nraijzsodgojkpyigefu`) avec transaction PostgreSQL atomique (BT JSON: ligne de main-d’œuvre + note technique, garage version +1; et session passée à `posted`). Contrôle `auth.uid()`, droits, statut du BT, facture liée, révision de session et de garage; refus de doublon.
- Test réel PostgreSQL effectué dans une transaction `BEGIN ... ROLLBACK` avec travail fictif 1,50 h × 100 $ = 150 $, note/ligne uniques et confirmation répétée refusée. **Aucune donnée du test conservée**.
- Nouveau fichier `audit/s06-wo-pilot.js` lié à `index.html` et **OFF par défaut**. Activation manuelle dans l'URL de prévisualisation Codespaces uniquement : `?s06_wo_pilot=1`.
- Dans un BT en cours non facturé, le panneau simplifié remplace visuellement les boutons du timer historique dans le mode TEST. La minuterie retrouve la dernière session du BT en lecture sur Supabase : Démarrer / Reprendre, Pause, Terminer et récupération si session interrompue (après 60 secondes).
- « Terminer » exige une session déjà en pause et au moins 18 s confirmées. Formulaire pour description obligatoire et taux horaire. Avant RPC de transfert : contrôles cloud sync sans aucune modification locale en attente, version CAS du snapshot; confirmation manuelle; arrêt des sauvegardes anciennes pendant le transfert; après RPC, relecture des deux tables et vérification note + ligne uniques, puis rechargement complet pour reprendre avec le snapshot neuf.
- Gestion d'échec : aucun affichage de faux succès; il faut recharger avant de réessayer. L'ancien timer reste fonctionnel lorsque le mode `s06_wo_pilot` est désactivé.

## Validation requise avant production
- Mode BT pilote non validé en navigateur : ouvrir un BT ouvert TEST sur Codespaces avec `?s06_wo_pilot=1`, vérifier le panneau et les 3 boutons. Ne pas lancer d'intervention facturable ni utiliser de BT réel. Vérifier ensuite démarrage, pause, persistance, conflit sur 2 appareils.
- Tests GitHub Actions = analyses syntaxiques/statiques, **pas tests UI navigateur ni transfert réel depuis le navigateur**.
- Vérifier que l'ancienne minuterie n'a aucun intervalle actif au moment d'ouvrir le pilote.
- Conserver la sauvegarde CSV de l'utilisateur. La production ne doit pas être modifiée.
