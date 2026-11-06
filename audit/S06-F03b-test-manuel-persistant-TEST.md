# S06-F03b — Essai d'une vraie minuterie persistante (TEST)

Branche GitHub : `s06/minuterie-persistante`; projet Supabase : `Atelier-mecaniqueJL-TEST`.
Code `audit/s06-live-test.js`, inclus dans `index.html` mais **désactivé par défaut**.
Condition d'activation uniquement dans Codespaces : `?s06_timer_test=1`. La prod n'a pas été touchée.

## Étapes manuelles à valider, une à la fois
1. `git pull`, puis ouvrir le port 8000 sur Chrome, `?s06_timer_test=1`, Ctrl+F5.
2. Vérifier que le panneau bleu « Minuterie persistante TEST » apparait. Cliquer **Charger BT** et **Lire sessions**. Aucun appel de mutation n'est fait.
3. Choisir un BT ouvert non facturé ; cliquer **Créer en pause**, confirmer. Une ligne apparaît dans `garage_timer_sessions`; aucun changement de BT.
4. Cliquer **Démarrer / Reprendre**. Heartbeat automatique toutes les 10 secondes seulement pendant cette session d'essai ouverte.
5. Attendre quelques secondes, cliquer **Pause** ; confirmer que le temps augmente. Fermer/réouvrir la page et relire les sessions : elle est encore en pause.
6. Tester 2 appareils / conflit de révision avant migration finale et branchement aux commandes réelles.

## Protections
- Uniquement via clic explicite ; les boutons historiques du BT ne sont pas remplacés.
- La création de session et les transitions appellent `s06_timer_transition`, pas la table directement. Aucune écriture dans `garage_data`, aucune note ni main-d'oeuvre.
- Prévalidation du compte Supabase `auth.getUser()`, de son garage unique, du BT ouvert non facturé.
- Pas de nouvelle session automatique au rechargement. Au prochain démarrage, `Lire sessions` permet de choisir la session existante.
- Le heartbeat est arrêté quand on ferme le panneau ou la page. Si une session est encore `running` après fermeture, attendre au moins 60 secondes puis cliquer **Récupérer** avant de reprendre : le temps non confirmé n'est pas ajouté.
- Ne pas utiliser sur le site GitHub Pages ni sur la production. Laisser les essais S06 exclusivement sur Codespaces et Supabase TEST.
- Étape distincte restante : transaction atomique `s06_timer_post_labor` non déployée et tests de comptes réels.
