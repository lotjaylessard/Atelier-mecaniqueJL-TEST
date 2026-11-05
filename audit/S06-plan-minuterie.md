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
- **Blocage actuel :** ne pas activer ni executer SQL avant revue SQL, verification d'une sauvegarde/export recuperable de Supabase TEST, et protocole de tests de permissions multi-comptes sur ce meme projet TEST. La creation d'un troisieme projet n'est PAS une etape demandee. Aucun changement en production.

## Decision utilisateur — 5 novembre 2026
- Continuer exclusivement dans **Atelier-mecaniqueJL-TEST** (GitHub et Supabase existants), sans demander un troisieme projet.
- Ne pas refaire les audits S02–S05 ni les verifications RLS deja obtenues; exploiter leurs constats.
- Supabase Free : sauvegardes automatiques non incluses. Les sauvegardes JSON et mecanismes de reprise deja construits sont a preserver, mais ne constituent pas un dump PostgreSQL ni une restauration eprouvee de cette migration.
- Avant toute execution SQL, obtenir une sauvegarde/export effectivement recuperable sans exiger de changement d'abonnement et verifier la migration par une revue de syntaxe et de permissions. Toute mutation doit etre limitative et reversible.
- Integrer le module nouveau progressivement; **index.html reste inchange tant que la couche serveur n'est pas confirmee**. Eviter de reutiliser les anciennes fonctions WO_TIMER_* sans audit exact des gestionnaires.

## S06-F05 — Decision du 5 novembre : pause vs terminer et ajouter
- Le bouton **Pause** conserve uniquement le temps mesure; n'ajoute jamais de ligne au BT.
- **Terminer et ajouter au BT** ouvre un dialogue de confirmation montrant duree et taux horaire avant toute mutation.
- Une unique ligne identifiee par `timerSessionId` est autorisee, avec verification de l'absence de facture (y compris impayee) et du statut en_cours.
- Premiere couche preparee et testee : `audit/s06-timer-posting.cjs` calcule une proposition pure, sans ecrire quoi que ce soit; `audit/test-s06-posting.cjs` couvre les refus de doublon et les cas invalides.
- **Pas encore branche au logiciel ni au Supabase** : le commit de la ligne et de l'etat de session devra etre atomique (une seule transaction CAS sur garage_data et timer). Ne pas reutiliser l'ancien Stop qui ajoute immediatement de la main-d'oeuvre.
- Interface validee dans Chrome : panneau masque sans minuterie, affiche en cours, pause orange, lien vers BT; elle observe l'ancienne minuterie et ne constitue pas encore une persistance multi-appareil.

## S06-F05 — Description et note du BT (5 novembre 2026)
- Decision utilisateur : une description du travail effectue est saisie dans la fenetre de confirmation. Apres confirmation reelle, ajouter une ligne de main-d'oeuvre et une entree de note technique au BT, avec temps, taux et description.
- Reutiliser le champ existant `wo.notes` (Notes techniques) en preservant son contenu; pas de deuxieme registre de notes.
- La proposition de note comporte le marqueur stable de session `[S06 minuterie : ...]`; refuser une note ou une ligne de main-d'oeuvre deja presente.
- Code pur non destructif prepare : `audit/s06-timer-posting.cjs`, fonction `proposedWorkNote`, avec validations et tests.
- Apercu visuel autonome (aucune ecriture) : `audit/s06-f05-confirmation-preview.html` ; permet de tester le champ et le rendu de la note dans Codespaces.
- **Aucune ecriture reelle encore** : la confirmation future devra etre atomique et idempotente avec la revision du JSON garage et celle de la minuterie, et refuser tout BT facture ou termine. Ne pas reutiliser le stop historique qui ajoute immediatement de la main-d'oeuvre.

## S06 — Attribution de l'employe a une intervention
- Le nom affiche est un instantane du profil lie au `auth.uid()` courant et l'identifiant reste enregistree dans la note. Ne pas utiliser le libelle statique `Bonjour, Jeremy` du HTML comme preuve d'identite.
- S06-F05 a une fonction pure `audit/s06-timer-actor.cjs` et des tests dans `audit/test-s06-actor.cjs`. Elle refuse les profils dont le `user_id` ne correspond pas a l'utilisateur authentifie, un nom vide, ou une date invalide.
- Ceci ne cree pas de table de profils, ne configure pas d'employe dans Supabase et ne modifie pas `index.html`. Avant le branchement reel, selectionner une source de profil fiable, controler sa correspondance avec `auth.uid()`, puis imposer identite/date du cote serveur de la transaction atomique.
- Decision de design : le bouton de pause n'ajoute aucune main-d'oeuvre ni note; seule la confirmation « Terminer et ajouter au BT » pourra ajouter les deux dans UNE transaction idempotente.
