# S06 — Protocole PostgreSQL sur base jetable

**Statut : NON EXECUTE.** Aucun serveur PostgreSQL ni projet Supabase jetable n'est accessible depuis cet environnement. Les tests GitHub Actions sont des tests statiques et simules et NE prouvent pas la validite SQL/RLS reelle.

## Prerequis
- Creer un projet Supabase jetable distinct des projets TEST actuel et production.
- Utiliser seulement des comptes et des bons de travail fictifs (deux utilisateurs, garages distincts).
- Dans la base JETABLE uniquement, faire revoir et executer la proposition V2 : audit/S06-F02-V2-BT-verification-NE-PAS-EXECUTER.sql.
- Verifier ensuite les droits par les SELECT du fichier audit/S06-verification-apres-migration-BASE-JETABLE.sql.
- Tester depuis deux sessions authentifiees independantes et un client anonyme, PAS exclusivement le SQL Editor administrateur.

## Scenarios obligatoires
1. Anonyme : aucun acces lecture, aucune execution de la RPC.
2. Compte A : refuse d'acceder aux sessions de B, meme avec son UUID.
3. Utilisateurs connectes : pas de modification INSERT, UPDATE ou DELETE directe.
4. BT inexistant, termine, archive ou facture : create/start refuses.
5. BT termine/facture apres creation : start refuse; prochain heartbeat met en pause sans main-d'oeuvre ajoutee.
6. Deux appareils : une seule minuterie running a la fois.
7. Deux mutations avec meme revision : une seule ecriture CAS reussit.
8. Fermeture normale : pause demandee, confirmation cote serveur; avertissement si echec.
9. Coupure brutale : recuperation apres heartbeat perdu, sans temps fantome.
10. Changement de BT pendant la validation serveur : verrou FOR SHARE sur garage_data doit serialiser la transaction.
11. Aucune mutation des factures ou du JSON du garage par la fonction de minuterie.
12. Hors-ligne / deconnexion / changement de compte : aucune fausse confirmation de sauvegarde.

## Notes de revue
- La fonction de verification BT utilise FOR SHARE sur garage_data et une fonction VOLATILE. Cette intention doit etre confirmee par essais transactionnels concurrents sur PostgreSQL reel.
- Une future fonction de transfert vers la main-d'oeuvre doit utiliser la version CAS de garage_data, etre idempotente et refuser toute facture partiellement ou totalement payee.
- L'option A (pause a la fermeture) ne peut pas intercepter toutes les fermetures brutales; le dernier heartbeat confirme constitue la limite conservative.
- Ne jamais modifier is_garage_member ou les grants existants dans ce chantier sans audit independant.

**Activation sur le Supabase TEST actuel : BLOQUEE** jusqu'aux essais reels sur la base jetable et a une autorisation explicite.
