# S08 — Résultat réel du 23 novembre 2026 (TEST)

## Vérifications effectuées
- Export physique depuis Chrome vers dossier local hors OneDrive : message final 0 erreur, 3 tables signalées non couvertes.
- Manifest fourni : 6 objets Storage, 3 995 189 octets, 4 chemins référencés, 2 non référencés, aucun échec ni référence non résolue.
- Snapshot JSON fourni : 104 598 octets ; empreinte SHA-256 vérifiée localement contre manifest ; 14 soumissions.
- Données opérationnelles dans le snapshot : 10 sessions minuterie, 6 notes de calendrier, 1 événement d'horaire.
- Lecture SQL TEST le 23 novembre : pour ce garage, exactement 10/6/1 lignes dans ces tables, toutes appartenant au compte exportateur ; aucune ligne d'un autre membre actuellement.
- Lecture SQL TEST : 1 garage_data, 14 garage_quotes, 2 garage_members, 1 garages, 3 connexions calendriers externes et 828 événements externes (cache/synchronisation).

## Ce que ces contrôles NE prouvent PAS
- Les six octets/fichiers physiques du dossier local n'ont pas été fournis ici : leurs SHA-256 ne sont pas revérifiés indépendamment.
- Le manifest reste INCOMPLETE par conception ; les métadonnées garages/membres et les connexions externes ne font pas partie du snapshot v1 complet.
- Les calendriers externes peuvent nécessiter une reconnexion et resynchronisation ; ne jamais exporter des jetons OAuth ou secrets ICS en clair dans un dossier partagé.
- Aucune restauration réelle vers une instance isolée n'a été exécutée.
- La couverture actuelle 10/6/1 n'autorise pas à présumer qu'il n'y aura jamais de lignes appartenant à d'autres membres.

## Prochaines actions non redondantes
1. Valider localement les SHA-256 des six fichiers physiques avec le préflight hors ligne (une fois le dossier accessible).
2. Concevoir et valider un périmètre de restauration tenant complet (métadonnées garages/membres, rôles, données privées et calendrier) sans exposer les secrets.
3. Restaurer dans un projet Supabase isolé, sans écraser TEST ni PROD ; vérifier les comptes, relations, pièces jointes et accès RLS.
4. Tester les parcours métier avec propriétaire/employé/deuxième garage, puis sauvegarde et retour arrière PROD avant toute migration autorisée.

**Décision : NO-GO. Aucune modification en production.**
