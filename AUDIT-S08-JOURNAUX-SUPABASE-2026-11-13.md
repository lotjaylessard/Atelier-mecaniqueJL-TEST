# S08 — Journaux Supabase TEST, contrôle réel en lecture seule (13 novembre 2026)

**Portée** : projet Supabase TEST `nraijzsodgojkpyigefu`; aucune interrogation de production, aucune écriture SQL, aucun fichier client téléchargé.

## Requêtes effectuées
Le connecteur de journaux Supabase a été utilisé sur sa fenêtre par défaut de 24 h. Les statistiques ci-dessous ne prétendent pas couvrir une période plus longue, ni représenter exhaustivement toutes les requêtes.

### Répartition par source
- `postgrest_logs` : 85 entrées.
- `edge_logs` : 79 entrées.
- `pgbouncer_logs` : 77 entrées.
- `postgres_logs` : 65 entrées.
- `auth_logs` : 37 entrées.
- `storage_logs` : 3 entrées.
- `realtime_logs` : 3 entrées.
- `auth_audit_logs` : 2 entrées.

### HTTP via edge_logs
- REST : GET 200 (35); OPTIONS 200 (4).
- Auth : GET 200 (35); OPTIONS 200 (2); POST 200 (1), POST 400 (1).
- REST-admin : GET 200 (1).
- Admin : POST 200 (1).
- Aucun HTTP 5xx présent dans ce sous-ensemble de 79 entrées.

### Auth / Storage
- `auth_logs` : 34 réponses HTTP 200, une réponse 400 `invalid_credentials`, une entrée sans statut.
- `storage_logs` : un GET 200, deux entrées sans statut/méthode renseigné. **Ne prouve pas que tous les uploads sont fonctionnels.**

### Erreurs PostgreSQL
- 57 événements LOG de code 00000 parmi 65 entrées.
- 7 entrées de sévérité ERROR : 3 × 42501 (permissions), 1 × P0001 (exception applicative levée), 1 × 42723 (fonction dupliquée), 1 × 42883 (fonction absente), 1 × 42601 (syntaxe SQL).
- **Les sept événements ERROR** sont tous identifiés sous `parsed.application_name=mgmt-api` et rôle `postgres`. Il s'agit de la voie d'administration, compatible avec les essais/migrations réalisés. On ne peut pas les attribuer avec certitude à une opération précise sans examen des événements, et rien ne prouve qu'aucune erreur client ne survient hors de cette fenêtre.

## Conclusions
- Aucune erreur HTTP 5xx observée parmi ces 79 événements d'API de périphérie.
- Une erreur d'identifiants Auth est observée, isolée dans cet échantillon.
- Les erreurs PostgreSQL observées viennent de mgmt-api, non d'un rôle de connexion utilisateur identifié dans les mêmes entrées.
- Ces contrôles **complètent** l'audit SQL et JavaScript, **mais ne remplacent pas** un parcours Chrome authentifié ou la restauration physique de fichiers.

## Dernières preuves requises avant 100 %
1. Parcours Chrome TEST complet (SO, BT, facture, paiements et reconnexion).
2. Accès aux octets réels Storage, SHA-256 et restauration isolée.
3. Statut d'exécution GitHub Actions confirmé (le dépôt possède le workflow, mais l'outil CI ne retourne aucun run exploitable).
4. Activation/test Supabase Auth de protection des mots de passe divulgués.
5. Recette UI avant activation du verrou serveur des factures payées.

**Production non touchée. Aucun client, facture, BT ou fichier physique modifié.**
