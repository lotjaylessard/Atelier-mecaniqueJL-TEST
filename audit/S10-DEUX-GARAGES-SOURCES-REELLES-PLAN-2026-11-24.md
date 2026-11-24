# S10 — Migration de DEUX garages réels (cible commune), 24 novembre 2026

## Décisions définitives du propriétaire

- Un seul projet Supabase de production, avec deux garages et deux comptes propriétaires isolés.
- **Aucun import de données métier depuis Supabase TEST.** TEST sert uniquement au développement/validation et doit conserver ses données intactes.
- Aucun employé au lancement; les scénarios spécifiques à l'emploi ne bloquent pas le lancement. Ne pas retirer les politiques multi-garages existantes.
- Toute écriture PROD, publication ou interruption exige un plan, une estimation de fenêtre et un **GO explicite spécifique**; «next» et «go» génériques ne l'autorisent pas.

## Origines distinctes

| Origine | Projet | Destination | Données à préserver |
|---|---|---|---|
| Atelier propriétaire | Supabase PROD `feeapfylfzlvgnqtglnh` | garage A de la PROD commune | Clients, véhicules, BT, factures, paiements, pièces, services, pièces jointes, comptes et données existantes |
| Atelier de l'ami | **Son propre Supabase externe — ID à récupérer** | garage B de la PROD commune | Ses clients, véhicules, BT, factures, paiements, pièces, services, notes, pièces jointes, compte et identité |
| Environnement TEST | `nraijzsodgojkpyigefu` | **AUCUN import** | Données TEST conservées en TEST uniquement |

La liste des projets Supabase accessibles dans la connexion courante ne comprend que PROD et TEST du propriétaire. **Le Supabase de l'ami n'est pas accessible ici**; aucune lecture, aucun dump ni audit frais du compte de l'ami n'a été effectué dans cette séance.

## Historique de référence, NON une mesure actuelle

Inventaire communiqué lors de la préparation du 2 novembre 2026 pour l'ami : environ **7 clients, 12 véhicules, 11 BT, 10 factures, 3 notes, 7 pièces, 5 services, 16 objets Storage** totalisant **24 509 932 octets**, dont **9 référencés et 7 non référencés**. Ces chiffres datés ne doivent **pas** être utilisés comme manifest final : recalculer sur une sauvegarde fraîche de l'ami.

Le propriétaire a déjà vérifié ses **55 fichiers PROD** (89 068 008 octets) et sa restauration SQL réelle phases 1–10 sur copie locale; ne pas lui faire refaire ces vérifications historiques. Seul un checkpoint FINAL, après gel des écritures, sera nécessaire le jour de la bascule.

## Chemin critique restant, sans reprise d'audits réussis

1. **Obtenir un accès en lecture ou un export indépendant** du Supabase de l'ami : DB, comptes Auth (transfert d'identité adapté), métadonnées, octets des fichiers Storage, politiques nécessaires; aucun secret d'administration à mettre dans GitHub/chat. Si l'ami se connecte ou partage un export, éviter l'exposition des identifiants service_role.
2. Contrôler l'inventaire **réel et actuel** de la source de l'ami et ses liens entre BT/factures/fichiers; identifier les numéros ou ID qui pourraient entrer en conflit avec le garage du propriétaire; définir la correspondance utilisateur → garage B.
3. Produire une **fusion locale isolée** des deux sources réelles ou un autre environnement jetable approuvé, jamais PROD ni TEST, puis comparer intégrité des deux garages et l'isolation des fichiers.
4. Valider Auth réelle propriétaire A et propriétaire B, URL signées et un parcours de pièce jointe; ne pas importer les données d'essai de TEST.
5. Préparer séparément secrets Google PROD, redirections exactes, fonctions FamilyWall et Outlook; tester le comportement réel avant d'activer les calendriers.
6. Obtenir GO explicite avec fenêtre estimée, checkpoint frais des DEUX sources après gel, plan de rollback DB + Storage + code web, puis fusion et publication. L'estimation **15–30 minutes** discutée précédemment est provisoire et pourrait être insuffisante pour deux sources réelles; revalider avant d'engager une fenêtre.

## État actuel

**NO-GO PROD.** Prochain blocage réel : **source Supabase de l'ami inaccessible**. Les tests SQL/RLS/CI déjà réussis n'ont pas à être recommencés.
