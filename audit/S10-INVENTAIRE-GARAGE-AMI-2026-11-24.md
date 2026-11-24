# S10 — Inventaire source réel du garage de l'ami (24 novembre 2026)

**Source Supabase :** `bdrtlveohbjwxcobeysb` (organisation indépendante de celle de l'Atelier). **Méthode : SQL SELECT uniquement via connexion Supabase autorisée. Aucune écriture source, TEST ou PROD.**

## Inventaire actuel

| Élément | Quantité |
|---|---:|
| Utilisateurs Auth | 1 |
| Lignes `public.garage_data` | 1 |
| Clients | 9 |
| Véhicules (dans clients) | 13 |
| Bons de travail | 16 |
| Factures | 15 |
| Notes | 3 |
| Pièces | 8 |
| Services | 5 |
| Objets Storage `wo-files` | 19 |
| Octets déclarés par Storage | 25 255 060 |
| Chemins de pièces jointes référencés | 12 |
| Chemins référencés présents physiquement dans le catalogue Storage | 12 |
| Références sans fichier correspondant | 0 |
| Objets Storage non liés aux BT | 7 |
| Objets Storage sans `owner_id` | 1 |
| Objets sans propriétaire **et non liés** | 1 |
| Objets avec propriétaire correspondant au garage utilisateur | 18 |
| Objets avec propriétaire défini mais absent de `auth.users` | 0 |
| Bucket public | oui |

Les 19 fichiers utilisent tous le préfixe historique `clients/`. La ligne `garage_data.user_id` correspond à un compte `auth.users` existant.

## Conséquences pour la migration

1. **Conserver 19/19 objets**, y compris les 7 non référencés et l'unique objet sans propriétaire.
2. **Ne jamais appliquer tel quel** le guard Storage S10 du premier garage à la source de l'ami : son unique fichier `owner_id IS NULL` le ferait refuser. Préparer un traitement isolé de ce fichier orphelin, sans le supprimer; établir l'attribution au garage B uniquement sur une preuve fiable.
3. Les deux sources utilisent des chemins historiques `clients/...`. **Comparer les noms complets dans les deux sources avant toute fusion** : des collisions de chemins pourraient écraser des fichiers ou relier des pièces au mauvais garage. Une stratégie robuste est de remapper les chemins de l'ami sous un namespace de garage B, puis réécrire de façon transactionnelle les références correspondantes et valider les bytes/hash; ne pas supposer que la concaténation des objets suffit.
4. **Préserver les 16 BT, 15 factures et les numéros existants** dans l'espace de son garage, y compris les paiements et taxes. Mettre en place un mapping des identités Auth (ne pas copier simplement les secrets d'authentification).
5. La connexion Supabase ChatGPT courante est désormais autorisée pour **l'organisation de l'ami**, tandis que les projets de l'organisation Atelier n'étaient plus listés dans la même session. Ne pas présumer que les deux sources sont accessibles simultanément par ce connecteur.
6. Le périmètre de recette initial est **deux propriétaires sans employé**, mais l'isolation entre garages reste obligatoire.
7. Aucune date de gel ni GO de migration n'a encore été autorisé. Les chiffres doivent être actualisés **uniquement lors du checkpoint final**, et non par des répétitions d'audit.

**Point technique non encore validé :** collision exacte entre les 19 chemins de l'ami et les 55 chemins PROD Atelier; cela requiert une comparaison des deux listes sans copier de données sensibles dans les rapports. Tests de connexion Auth réelle sur la destination, Signed URLs et transferts physiques toujours en attente.
