# Audit S02 — protections structurelles (PROPOSITION, NE PAS EXÉCUTER)

État : document de conception, aucune modification de Supabase. Préparé après restauration locale ciblée réussie (1 garage, 2 membres, 2 lignes garage_data, 4 BT, 4 clients).

## Confirmations issues de l'audit
- `garage_data.user_id` est PK et FK vers `auth.users(id) ON DELETE CASCADE` : suppression d'un utilisateur propriétaire peut effacer sa ligne de données.
- `garage_data.garage_id` est nullable, mais UNIQUE ; il existe une ligne employé héritée à NULL, version 0, sans contenu métier apparent.
- Rôle `authenticated` a UPDATE sur `user_id` et `garage_id` ; RLS permissives incluent `Garage owner access` pour toutes les opérations.
- Une fonction `public.protect_garage_data_ids()` et un trigger `garage_data_protect_garage_data_ids_trigger` figurent dans le catalogue de sauvegarde ; **leur définition et leur activation doivent être examinées avant de conclure que les colonnes sont vulnérables**.
- `can_read_garage_file` autorise l'accès via appartenance commune de deux comptes, sans association du fichier à un garage précis.
- Storage contient quatre objets et un objet orphelin connu ; les octets sont sauvegardés séparément.
- La restauration ciblée a reconstruit les 3 tables métier **sans RLS/FK**, ce n'est pas une restauration Supabase complète.

## S02-1 : diagnostic lecture seule, projet TEST UNIQUEMENT
```sql
select t.tgname as trigger_name, t.tgenabled as enabled,
       pg_get_triggerdef(t.oid) as trigger_definition,
       pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='garage_data'
  and not t.tgisinternal
order by t.tgname;
```

## S02-2 : contrôle des rôles, privilèges, appartenance et isolation
- Inspecter si le trigger empêche la modification des identifiants par les membres ordinaires.
- Vérifier le comportement effectif des RLS depuis deux comptes **et un troisième garage réellement distinct**, jamais en tant que rôle administratif du SQL Editor.
- Vérifier les permissions INSERT / UPDATE / DELETE Storage et la séparation des objets inter-garages.
- Contrôler le propriétaire et les EXECUTE GRANT des fonctions SECURITY DEFINER, leur `search_path`, et l'absence de droits excessifs.

## Changements candidats à étudier (NE PAS APPLIQUER)
1. Retirer le lien dangereux `ON DELETE CASCADE` de `garage_data.user_id` après inventaire des dépendances, sauvegarde vérifiée et validation des procédures de suppression de comptes. Une FK `ON DELETE RESTRICT` ou équivalent peut empêcher l'effacement silencieux ; examiner l'incidence sur l'administration des utilisateurs.
2. Verrouiller les colonnes d'identité contre les modifications ordinaires, en tenant compte du trigger existant et des politiques RLS ; éviter d'invalider les mises à jour de JSON et de version.
3. Nettoyer la ligne héritée `garage_id IS NULL` **uniquement après** exportation indépendante complète, confirmation de son contenu et test de la correction sur environnement jetable.
4. Associer les objets Storage au garage, pas seulement au téléverseur, avec migration non destructive des anciens chemins.
5. Prévoir une procédure de sauvegarde/restore reproductible et contrôler les fichiers Storage de bout en bout.

## Conditions bloquantes avant migration ami
- Snapshot frais du TEST et des données actuelles de l'ami, hors GitHub public ; sauvegarde des fichiers ; restauration testée.
- Politiques RLS validées par tests négatifs entre garages.
- 0 perte silencieuse sur sauvegardes concurrentes / suppressions.
- Migration répétée sur une copie indépendante puis audit final après correction.
- Validation et autorisation explicite avant migration réelle.

**IMPORTANT** : Ne pas exécuter de DDL dans le projet de production.
