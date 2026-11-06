# S06 — Validation transactionnelle TEST du 6 novembre 2026

Projet cible : `Atelier-mecaniqueJL-TEST` (`nraijzsodgojkpyigefu`). Production non touchee.

## Tests executes dans Supabase TEST

- Lecture de la base : 2 BT ouverts et avec `labor` valide dans le garage actif (version 220) ; aucune session persistante.
- Test fonction `s06_timer_check_work_order` avec contexte JWT **simule dans SQL** : accepte un BT ouvert admissible ; refuse un BT inexistant et un UID usurpe. Aucun changement durable.
- Transaction explicite `BEGIN ... ROLLBACK` : fonction `s06_timer_transition`, sequence `create` (paused revision 0), `start` (running revision 1), tentative avec revision perimee refusee, `pause` (paused revision 2). Aucune facture ou note ajoutee. Apres ROLLBACK : **0 session**.
- Transaction explicite `BEGIN ... ROLLBACK` : insertion de deux sessions fictives associees a deux utilisateurs existants ; activation du role SQL `authenticated` et contexte UID simule ; un seul enregistrement visible par la politique RLS et aucun droit d'ecriture direct pour le role. Apres ROLLBACK : **0 session**.

## Limites importantes

Les identites ont ete simulees avec `request.jwt.claim.sub` dans SQL. Ce ne sont **pas** des connexions authentifiees reelles par l'application web. La simulation du role RLS est precieuse mais ne remplace pas le test HTTP avec deux vraies sessions utilisateur. La fermeture brutale, le heartbeat sous latence, le changement de BT concurrent et la reconciliation du navigateur ne sont pas encore testes en bout-en-bout.

La fonction de transfert final `s06_timer_post_labor` n'est pas deployee ; aucune note ni ligne de main-d'oeuvre n'a ete modifiee.

**Prochaine etape** : finaliser adaptateur RPC et interface derriere un mode TEST non activant, puis realiser un vrai test de connexion utilisateur avant tout remplacement du timer historique.
