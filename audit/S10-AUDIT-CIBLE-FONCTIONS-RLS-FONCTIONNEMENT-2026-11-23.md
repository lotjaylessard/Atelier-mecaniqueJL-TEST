# S10 — Audit ciblé SQL / RLS / fonctionnement (23 novembre 2026)

## Périmètre et preuve
Comparaison **lecture seule** des catalogues PostgreSQL Supabase TEST `nraijzsodgojkpyigefu` et PROD `feeapfylfzlvgnqtglnh`, inventaire Edge Functions et exécutions GitHub Actions sur `integration-finale`. Aucun changement PROD. Le test navigateur réel multicomptes n'a PAS été exécuté.

## Constats confirmés
- TEST : 12 tables publiques applicatives avec RLS activée; PROD : une seule (`garage_data`).
- TEST : 16 fonctions SQL dans `public`; PROD : 0. Les RPC nécessaires au minuteur, à la conversion soumission→BT et à la finalisation BT→facture ne sont pas en PROD.
- TEST : 4 Edge Functions actives (`garage-calendar-oauth`, `garage-outlook-ical`, `garage-familywall-calendar`, `garage-microsoft-calendar`); PROD : 0. Le calendrier ne sera pas opérationnel avec un simple changement d'URL.
- TEST : `storage.buckets.wo-files.public=false`; PROD : `true`. Changer l'accès nécessite d'abord de valider l'accès aux 55 fichiers historiques et la migration des liens publics.
- TEST : `garage_data` SELECT/UPDATE autorise `owner` et `employee`, mais pas `admin`; même exclusion sur les politiques de lecture/mise à jour des soumissions. Le schéma `garage_members` autorise pourtant `owner/admin/employee`. Définir le rôle admin et corriger/tester si nécessaire avant migration.
- TEST : politiques de `garage_quotes` asymétriques : lecture/mise à jour partagées dans un garage, insertion/suppression réservées au créateur. Vérifier le workflow métier et les transitions.
- TEST : `garage_schedule_events` distingue `private` (créateur) et `workshop` (membres); l'UPDATE/DELETE appartient au créateur. Confirmer en navigateur.
- TEST : `garage_timer_sessions` a RLS forcée; ses écritures passent par RPC. Plusieurs RPC `SECURITY DEFINER` existent, avec privilèges d'exécution à vérifier par utilisateur et garage.
- PROD : `garage_data` possède des politiques utilisateur historiques et un `INSERT` ouvert au rôle `public` avec condition `auth.uid()=user_id`. Ne pas remplacer sans scénario de compatibilité.
- La restauration locale de PROD contient les 1 ligne JSONB, 1 utilisateur Auth et 55 métadonnées Storage; 9 erreurs liées à l'environnement Supabase manquant, donc les RLS ne sont pas validées localement.
- Phases locales 1 et 2 : `garage_data` enrichie et un garage + propriétaire créés; sortie `1/1/1/55` confirmée par le propriétaire. Aucun fichier ni donnée TEST importé.
- GitHub Actions : dernier contrôle S10 observé `success` (`95500d2f`), mais deux exécutions antérieures observées `failure` : ne pas généraliser à l'ensemble des scénarios fonctionnels.

## Bloqueurs avant GO
1. Reconstituer les 10 tables applicatives restantes, contraintes, fonctions SQL, déclencheurs, GRANT et politiques depuis l'état **réel** de TEST; script ordonné, transactionnel et vérifié sur copie locale (pas sur PROD).
2. Préparer une validation RLS authentifiée sur environnement Supabase isolé, comptes owner A / employee A / owner B; refus cross-garage, autorisations et mutation d'identité, Storage.
3. Reprendre les Edge Functions actives et leur configuration (secrets/OAuth/callbacks) sans copier les secrets TEST; tester les calendriers.
4. Vérifier le parcours navigateur soumission→BT→minuteur→facture→paiement, calendrier et pièces jointes, avec données fictives sur environnement isolé.
5. Vérifier l'intégrité des 55 fichiers téléchargés et le plan de rollback, puis demander autorisation explicite pour PROD.

## Décision
**NO-GO PROD**. Tests statiques/CI et sauvegarde locale ne remplacent pas les tests authentifiés et le fonctionnement de l'application. Priorité : construire un paquet SQL complet et une recette fonctionnelle courte, pas multiplier les inventaires.
