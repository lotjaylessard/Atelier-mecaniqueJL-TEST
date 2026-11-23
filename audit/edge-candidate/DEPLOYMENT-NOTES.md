# Déploiement des fonctions calendrier — candidat S10

**État : non déployé.** Les sources ci-dessous sont dans `audit/edge-candidate/`. Aucun secret ni donnée TEST ne doit être transféré.

| Fonction | Source | JWT plateforme | Authentification applicative |
|---|---|---|---|
| garage-calendar-oauth | index.ts | désactivée en TEST | vérification du jeton utilisateur dans le code |
| garage-familywall-calendar | index.ts + ics.js | désactivée en TEST | vérification du jeton utilisateur dans le code |
| garage-microsoft-calendar | index.ts | désactivée en TEST | vérification du jeton utilisateur dans le code |
| garage-outlook-ical | index.ts + ics.js | désactivée en TEST | vérification du jeton utilisateur dans le code |

## Paramètres nécessaires
- Supabase fournit `SUPABASE_URL` et les clés d'accès adaptées au projet cible.
- Google : `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_ENCRYPTION_KEY_HEX`.
- Microsoft : `MICROSOFT_CALENDAR_CLIENT_ID`, `MICROSOFT_CALENDAR_CLIENT_SECRET`, même clé de chiffrement.
- FamilyWall / Outlook iCal : même clé de chiffrement pour protéger les liens privés.
- Ne jamais réutiliser les jetons OAuth, URL iCal privées ou valeurs secrètes du projet TEST.
- Autoriser dans les consoles OAuth Google et Microsoft les URL de redirection du projet PROD, de forme `https://<PROD_PROJECT_REF>.supabase.co/functions/v1/garage-calendar-oauth` et `.../garage-microsoft-calendar`.
- Vérifier les secrets, la sécurité JWT, les permissions et les routes avant tout déploiement. La désactivation du contrôle JWT au niveau plateforme n'est acceptable que si la fonction valide elle-même les requêtes; vérifier également les callbacks OAuth publics.

## Déploiement
Ces sources sont **des candidats**, pas un déploiement prêt à lancer sans revue. Déployer uniquement après validation des variables d'environnement et autorisation du propriétaire. Tester ensuite la connexion/déconnexion, la récupération d'événements et les droits entre garages.
