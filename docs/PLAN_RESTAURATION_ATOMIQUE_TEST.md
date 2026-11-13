# Garage Atelier Mécanique J.L — Plan de restauration atomique (TEST)

État : **spécification de sécurité, non déployée**. La fonction d'import actuelle inspecte seulement les JSON. Ne pas permettre de restauration par simple `localStorage.setItem` ou deux appels `supabase.from(...).update(...)`.

## Constat vérifié dans TEST

- Données métier : `public.garage_data.data` (JSONB), avec `version` et `garage_id`.
- Soumissions : `public.garage_quotes`, chaque ligne avec `id`, `version`, `garage_id`, `user_id`.
- Les soumissions de l'export actuel sont limitées au **compte connecté** par la politique RLS.
- Fichiers BT : le JSON conserve leurs **références**, pas les octets de Supabase Storage.
- Sessions de minuteur, profils/Auth, adhésions de garage et historiques de version ne sont pas sauvegardés par cet export.
- L'export v2 possède éventuellement une empreinte SHA-256. Elle détecte les altérations accidentelles; **elle n'authentifie pas** l'auteur.
- Plusieurs comptes et garages existent déjà dans le projet TEST : ne pas considérer l'export d'un compte comme la copie de tous les membres.

## Critères bloquants avant toute restauration

1. Sur TEST uniquement, créer une sauvegarde séparée du serveur **avant** tout essai d'écriture, avec preuve de relecture indépendante.
2. Authentifier `auth.uid()`, vérifier le droit explicite de propriétaire du garage et la correspondance `garage_id` du fichier. Ne jamais accepter le choix arbitraire d'un autre utilisateur.
3. Contrôler taille, structure, intégrité, numéros uniques et références des factures, BT et soumissions **côté serveur**, même si le navigateur les a validés.
4. Refuser l'effacement ou la modification de **toute facture payée/partielle/archivée** et de son historique, ainsi que toute référence à un BT inexistant. Les anciennes anomalies de paiement doivent rester intactes pour examen manuel.
5. Définir la politique multiutilisateur : refus explicite de la restauration d'un export qui exclut les soumissions des autres membres. Même obligation pour les fichiers joints physiques.
6. Rejeter les restaurations quand une session minuteur active ou un transfert vers un BT est en cours, jusqu'à ce que ces états soient également protégés.
7. Fournir un *dry-run* côté serveur qui retourne un plan de différences détaillé et une raison de refus, **sans écriture**.
8. Toute vraie opération doit avoir une confirmation explicite pour **une seule version contrôlée** et un identifiant d'opération anti-double clic. Aucune restauration déclenchée par l'inspection seule.
9. Le serveur doit effectuer les écritures de `garage_data` et de **toutes** les `garage_quotes` concernées dans **une transaction PostgreSQL**, et non plusieurs requêtes depuis le navigateur. Utiliser le verrouillage des lignes et des contrôles CAS `version`; toute erreur entraîne `ROLLBACK`.
10. Ne pas éditer/remplacer les fichiers Storage sans mécanisme distinct de sauvegarde et de restauration coordonnée. Si cette garantie est absente : bloquer la restauration complète.
11. Vérifier les droits `SECURITY DEFINER`, le `search_path`, les `GRANT EXECUTE`, RLS et la visibilité des données du garage. Aucun accès `anon`.
12. Après opération, comparer les versions et les dénombrements, recharger à partir du serveur, conserver un journal d'audit et pouvoir retrouver la sauvegarde d'avant restauration.

## Séquence serveur visée (non implémentée)

- Validation du compte, du garage, de l'intégrité et de la portée du fichier.
- Plan de différences côté serveur; aucune mutation.
- Confirmation de la version attendue et de l'empreinte du plan.
- Transaction PostgreSQL : verrouiller snapshot, soumissions et états du minuteur pertinents; vérifier à nouveau versions/permissions, invariants et portée complète; appliquer ensemble les changements; confirmer les versions après mutation; journaliser.
- À la moindre divergence : **rollback sans restauration partielle**.
- La stratégie d'objets Storage doit être établie avant d'offrir la fonction au garage.

## Jeux de tests obligatoires

- Restauration de données TEST fictives dans un garage TEST isolé.
- Même version / données identiques; même version / données divergentes; version trop ancienne ou trop récente.
- Conflits concurrents : modification des factures, BT, notes, pièces, services et soumissions pendant l'opération.
- Une soumission ajoutée/supprimée entre le dry-run et la confirmation.
- Deux clics simultanés de restauration; interruption réseau avant et après COMMIT.
- Facture payée ou partielle absente du fichier; montant historique incohérent; facture archivée.
- Changement de membre ou de garage, utilisateur déconnecté, accès entre garages refusé.
- Pièce jointe référencée mais fichier physique absent.
- Session minuteur active/confirmée/traitée au moment de la restauration.
- Sauvegarde comportant un JSON altéré, des sections manquantes, un autre compte ou des IDs dupliqués.
- Test de non-régression des écrans et opérations de travail dans Chrome après synchronisation.

**Décision actuelle : restauration désactivée.** Les fonctions `inspectGarageBackup` et `inspectGarageBackupCloud` n'effectuent aucune écriture.
