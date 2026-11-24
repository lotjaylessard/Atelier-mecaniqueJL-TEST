# S10 — Préparation des calendriers pour PROD (sans déploiement)

**État : prêt pour revue, mais NON DÉPLOYÉ.** Versionnement dans `integration-finale`. Aucun secret ni donnée de TEST à transférer.

## Inventaire vérifié le 23 novembre 2026

| Fonction Edge | Appelée actuellement dans `index.html` | Configuration PROD |
|---|---|---|
| `garage-calendar-oauth` | Oui, connexion Google Calendar | OAuth Google + chiffrement |
| `garage-familywall-calendar` | Oui, flux FamilyWall ICS | Clé de chiffrement |
| `garage-outlook-ical` | Oui, flux Outlook/Hotmail ICS | Clé de chiffrement |
| `garage-microsoft-calendar` | **Non** : aucun appel depuis le frontend actuel | OAuth Microsoft si ajouté ultérieurement |

Les trois premières fonctions sont **prioritaires pour la bascule**; ne pas rendre l'OAuth Microsoft obligatoire alors que le site utilise actuellement Outlook ICS. Les quatre sources candidates restent conservées pour la suite.

- PROD Supabase : `feeapfylfzlvgnqtglnh`, **aucune fonction Edge déployée**.
- TEST Supabase : `nraijzsodgojkpyigefu`, quatre fonctions déployées. Ne jamais désactiver ou réutiliser la configuration TEST.
- URL des fonctions PROD attendue : `https://feeapfylfzlvgnqtglnh.supabase.co/functions/v1/<slug>`.
- Le constructeur `audit/s10-build-production-candidate.cjs` remplace toutes les URL Supabase TEST dans les pages générées par l'URL PROD. Il n'est **pas** autorisé à publier.
- Les candidats Edge déduisent leur URL de callback de `SUPABASE_URL`. Les quatre sources PROD ont maintenant des libellés `PROD`, pas `TEST`.
- Les endpoints sont configurés avec `verify_jwt=false` côté gateway pour le callback OAuth public; les requêtes privées sont authentifiées par le handler via `/auth/v1/user` et les membres du garage. La simple présence de ce contrôle source n'est PAS un test Auth réel.

## Paramètres à préparer séparément et en privé

Les variables intégrées Supabase sont `SUPABASE_URL`, `SUPABASE_ANON_KEY` ou `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEYS`. Vérifier leur disponibilité **dans PROD** avant déploiement; ne jamais les copier dans GitHub, PowerShell logs ou paramètres frontend.

Variables applicatives nécessaires :
- `GOOGLE_CALENDAR_ENCRYPTION_KEY_HEX` : clé AES-GCM PROD aléatoire de 32 octets encodés en 64 caractères hexadécimaux; utilisée par Google et les flux FamilyWall/Outlook. Les valeurs existantes de TEST ne doivent pas être réutilisées. Ne jamais modifier une clé après connexion sans plan de réchiffrement ou de reconnexion : les données déjà chiffrées deviendraient illisibles.
- `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` : crédentiels OAuth Google PROD, dans Supabase secrets.
- Si l'intégration OAuth Microsoft devient réellement active : `MICROSOFT_CALENDAR_CLIENT_ID`, `MICROSOFT_CALENDAR_CLIENT_SECRET`.

Redirections OAuth exactes à autoriser auprès du fournisseur :
- Google : `https://feeapfylfzlvgnqtglnh.supabase.co/functions/v1/garage-calendar-oauth`
- Microsoft (facultatif, non appelé aujourd'hui) : `https://feeapfylfzlvgnqtglnh.supabase.co/functions/v1/garage-microsoft-calendar`

## Ordre d'opérations, **APRÈS** restauration et feu vert du propriétaire

1. Préserver toutes les valeurs et fonctions TEST. Confirmer que le nouveau schéma SQL PROD comporte les tables `garage_external_calendar_*`, les tables de secrets FamilyWall et les politiques correctes.
2. Créer les secrets **dans PROD seulement**, par une interface protégée. Vérifier la configuration OAuth dans Google, en particulier l'URI de callback exacte.
3. Déployer les trois fonctions prioritaires depuis `audit/edge-candidate/<slug>/`, avec les dépendances locales `ics.js` nécessaires. La fonction Microsoft facultative reste non déployée si non utilisée.
4. Vérifier le `GET` d'état de chaque fonction : disponible/configuré, sans divulguer de secret. Vérifier que les appels privés sans session ne retournent pas d'événements.
5. Sur une session propriétaire **PROD** réelle : connecter Google, enregistrer un flux FamilyWall et le flux Outlook/Hotmail; confirmer les heures, catégories, isolation entre comptes et visibilité dans Horaire et Dashboard.
6. Déconnexion/reconnexion Google et test de session employé; ne jamais recopier les tokens, URL ICS ni événements personnels TEST vers PROD.
7. Si un test échoue : **NO-GO**, laisser le site de production ancien inchangé. Corriger dans le candidat, refaire la recette; aucun déploiement de site avant validation complète.

## Ce qui reste impossible à confirmer actuellement

- Les trois connexions ne sont pas testées avec une identité PROD ni des secrets PROD; aucune fonction Edge n'est encore déployée sur PROD.
- Les redirections OAuth ne sont pas encore enregistrées auprès du fournisseur pour l'URL PROD.
- Le site actuel utilise des liens URL directs pour les appels; le test de remplacement de la configuration doit précéder toute publication.
- Les sauvegardes et la restauration PostgreSQL du portable du bureau sont distinctes : **ne pas les refaire**. Leur validation finale attend l'accès physique à cet ordinateur.
