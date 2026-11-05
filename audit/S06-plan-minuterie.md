# S06 — Minuterie persistante (option A), conception de reference

Etat au 5 novembre 2026 : S06-F01 est une **bibliotheque pure et ses tests**; elle n'est PAS branchee au logiciel. L'ancienne minuterie reste active jusqu'a la validation de S06.

## Comportement confirme
- Une minuterie active au maximum **par compte**; chaque session est rattachee a un BT, jamais a un nom affiche libre.
- Démarrer / pause / reprendre (meme le lendemain et sur autre ordinateur).
- Pause automatique a la fermeture **dans la mesure ou le navigateur le permet**. Pour crash, hors-ligne et fermeture non detectee, dernier heartbeat **confirme et synchronise** fait foi; le temps suivant est perdu plutot que facture par erreur.
- Affichage global discret dans l'entete, panneau BT/client/vehicule/duree et boutons Pause/Reprendre, Terminer.
- « Terminer » ne cree aucune facture et aucune ligne de main-d'oeuvre sans confirmation explicite. Afficher temps reel et temps facture distincts.
- BT termine, paye ou archive : interdiction de demarrer et de poster des heures; ne pas modifier les factures deja payees ou partiellement payees.
- Possibilite de corriger des periodes avec journal d'audit (raison, auteur, avant/apres) dans une version ulterieure.

## Etapes de developpement
S06-F01 : coeur purement local, tests sans donnees — termine.
S06-F02 : proposition de stockage Supabase separe, RLS par utilisateur, unicite active et CAS/version dans `audit/S06-F02-proposition-timer-TEST-NE-PAS-EXECUTER.sql` ; **code et tests statiques termines, migration PAS appliquee, validation Supabase bloquante**. Aucun nouveau champ dans le JSON principal ne doit ecraser un autre appareil.
S06-F03 : moteur de persistance : action atomique demarrer, heartbeat, pause, reprise, reconciliation, gestion hors-ligne et conflit. Un etat local non synchronise ne doit PAS etre considere partage.
S06-F04 : panneau global en entete, information du BT, compteur stable et controles accessibles.
S06-F05 : transfert idempotent au BT : cle unique de session, validation avant ajout, verrouillage des BT payes/archives, gestion de tarif, temps reel vs facture. Aucun ajout a la facture sans action explicite.
S06-F06 : tests multi-ordinateur/conflits, fermeture normale et brutale, pertes reseau, protections paiement/archives, sauvegarde/restauration. Passage en production seulement apres accord explicite.

## Politique de mesure
- Durée persistée en millisecondes entiers, conversion en heures decimales seulement pour la facturation.
- Heartbeats recommandés toutes les ~10 secondes, avec pause avant unload en best effort. Ne jamais compter le temps entre le dernier heartbeat persiste et le retour apres fermeture inattendue.
- L'horloge du navigateur n'est pas autoritaire en environnement multi-appareil : choisir des timestamps et revisions imposes par le serveur, et valider ordre/limites.
- Le coeur S06-F01 exprime les transitions, mais n'offre **aucune garantie de CAS, synchronisation ou reprise cross-device sans backend**.
- Une seule session active par compte doit etre garantie par contrainte transactionnelle cote serveur, pas seulement en JavaScript.
- Pas de recalcul retroactif d'une facture existante.

## S06-F02 — etat de securite
- SQL propose, non execute; pas d'autorisation implicite de migration.
- Les fonctions RPC gardent la revision et l'identite; tout transfert au BT et tout changement facture restent hors de portee.
- Avant l'application sur TEST : examiner permissions existantes, schema auth et types des BT; ajouter verification de possession et d'etat du BT pour toute future action de demarrage/transfert; valider deux comptes distincts et la fermeture brutale.
- `posted` est reserve au futur mecanisme de transfert atomique; la RPC F02 ne peut pas le definir.

## S06 — Verification de l'acces BT cote serveur (preparation, NON deployee)
- V1 SQL obsolette, ne jamais executer; V2 proposee dans `audit/S06-F02-V2-BT-verification-NE-PAS-EXECUTER.sql`.
- Preflight SUPABASE TEST (lecture seule) a montre `garage_data` et `garage_members` avec RLS active; `garage_timer_sessions` absente. Politiques relevées par utilisateur dans la conversation; `is_garage_member` SECURITY DEFINER avec execute anon, non modifie.
- V2 exige une appartenance garage valide, un BT unique en cours, sans facture, et protege les sessions par utilisateur.
- Si un ordinateur reste silencieux >60 secondes, son ancienne session active peut etre mise en pause lors du prochain demarrage sur le meme compte. Aucun temps non confirme n'est ajoute.
- Un appel direct a `recover` est bloque si un heartbeat recent suggere que l'autre ordinateur est actif.
- GitHub Actions verifie les invariants et la syntaxe JavaScript des tests; ce N'EST PAS une execution SQL, RLS, ni un test concurrent reel.
- **Blocage actuel :** ne pas activer ni executer SQL avant revue SQL et essais sur une base jetable, puis tests de permissions multi-comptes sur Supabase TEST avec sauvegarde validee.
