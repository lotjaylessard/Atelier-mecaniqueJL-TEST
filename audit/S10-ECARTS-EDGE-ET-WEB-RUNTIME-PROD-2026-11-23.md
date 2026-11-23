# S10 — Derniers blocages de déploiement (état réel au 23 novembre 2026)

## Acquis à ne pas refaire
- Une restauration locale PostgreSQL via PowerShell a déjà été tentée. Elle a retrouvé 1 utilisateur Auth, 1 garage_data et 55 **métadonnées** Storage; le processus a retourné un code 1 lié notamment à des objets Vault/rôles. Ne pas présenter cette restauration comme parfaite ou la recommencer par habitude.
- Inventaire PROD en lecture seule : **55 objets**, dont **49 chemins référencés** dans les bons de travail et **6 sans référence**. Toutes les 49 références trouvent un objet Storage; les 55 ont le propriétaire de l'unique garage PROD.
- Les données de TEST ne sont jamais une source d'import vers PROD.
- Candidat web S10 : URL et clé publishable PROD, préfixe local distinct par garage, liens privés signés, trois scripts de minuterie copiés. Un fichier NO-GO reste volontairement attaché au candidat de revue.

## Écart critique confirmé en direct Supabase
| Fonction | TEST | PROD |
|---|---|---|
| garage-calendar-oauth | ACTIVE | ABSENTE |
| garage-familywall-calendar | ACTIVE | ABSENTE |
| garage-outlook-ical | ACTIVE | ABSENTE |
| garage-microsoft-calendar | ACTIVE | ABSENTE |

**0 Edge Functions en PROD, 4 en TEST.** Elles ne peuvent pas être reprises telles quelles sans les secrets propres à PROD, les redirect URIs OAuth, les éventuelles migrations SQL et la validation des méthodes d'authentification. Ne pas transférer les jetons ou URL privées de TEST.

Sources candidates versionnées sous `audit/edge-candidate/`. Ne pas confondre les sources `supabase/functions/` du dépôt et les versions déployées actuellement dans le cloud TEST. Examiner leur dérive avant une reprise de PROD.

## Correctif déploiement appliqué au code (pas en PROD)
L'application `index.html` charge :
- `./img/logov2.png`
- `audit/s06-live-test.js`
- `audit/s06-wo-pilot.js`
- `audit/s06-sidebar-persistent.js`

L'ancien générateur S10 ignorait les trois JavaScript. Il copie désormais toutes les ressources locales autorisées **effectivement référencées**, refuse les références relatives inconnues/manquantes, et le garde de déploiement confirme leur présence. Aucun dump, fichier de test, dossier audit complet ou secret n'est copié dans le candidat.

## Suite de la bascule en une opération planifiée
1. Récupérer la preuve de restauration PowerShell déjà réalisée et vérifier séparément les octets des 55 fichiers si cela n'a pas déjà été fait. Ne pas répéter les contrôles confirmés.
2. Confirmer le véritable dépôt ou dossier GitHub Pages de PROD, absent des dépôts accessibles via ce connecteur (seul TEST est visible).
3. Sur copie isolée de PROD : installer les phases SQL requises, vérifier la structure multigarage et les RLS, puis valider les liens existants avant passage au bucket privé.
4. Préparer et déployer les quatre fonctions Edge avec secrets PROD dans une fenêtre autorisée. Vérifier les callbacks OAuth PROD, les autorisations et les cookies/redirections.
5. Une recette navigateur condensée : accès owner/employee/autre garage, BT→facture→paiement, pièces jointes et calendriers; puis autorisation de bascule et retour arrière.

**PROD inchangée; pas de fusion, écriture SQL ni publication.** Ne pas annoncer un pourcentage de progression factice.
