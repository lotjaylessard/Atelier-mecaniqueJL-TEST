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
| Atelier de l'ami | Supabase externe `bdrtlveohbjwxcobeysb` (accessible, lecture seule confirmée) | garage B de la PROD commune | Ses clients, véhicules, BT, factures, paiements, pièces, services, notes, pièces jointes, compte et identité |
| Environnement TEST | `nraijzsodgojkpyigefu` | **AUCUN import** | Données TEST conservées en TEST uniquement |

Le Supabase de l'ami a été consulté **en lecture seule le 24 novembre 2026**. Son inventaire actuel est dans `audit/S10-INVENTAIRE-GARAGE-AMI-2026-11-24.md` : 9 clients, 13 véhicules, 16 BT, 15 factures, 19 fichiers (dont un sans propriétaire et sept non référencés). Les chiffres historiques ci-dessous ne sont plus les mesures courantes.

## Historique de référence, NON une mesure actuelle

Inventaire communiqué lors de la préparation du 2 novembre 2026 pour l'ami : environ **7 clients, 12 véhicules, 11 BT, 10 factures, 3 notes, 7 pièces, 5 services, 16 objets Storage** totalisant **24 509 932 octets**, dont **9 référencés et 7 non référencés**. Ces chiffres datés ne doivent **pas** être utilisés comme manifest final : recalculer sur une sauvegarde fraîche de l'ami.

Le propriétaire a déjà vérifié ses **55 fichiers PROD** (89 068 008 octets) et sa restauration SQL réelle phases 1–10 sur copie locale; ne pas lui faire refaire ces vérifications historiques. Seul un checkpoint FINAL, après gel des écritures, sera nécessaire le jour de la bascule.

## Chemin critique restant, sans reprise d'audits réussis

1. **Accès lecture au Supabase de l'ami : ACQUIS.** Reste à préparer et récupérer en privé un checkpoint réel (DB, Auth sans secrets, métadonnées, octets Storage), uniquement lors du transfert approuvé; aucun secret d'administration dans GitHub/chat.
2. Contrôler l'inventaire **réel et actuel** de la source de l'ami et ses liens entre BT/factures/fichiers; identifier les numéros ou ID qui pourraient entrer en conflit avec le garage du propriétaire; définir la correspondance utilisateur → garage B.
3. Produire une **fusion locale isolée** des deux sources réelles ou un autre environnement jetable approuvé, jamais PROD ni TEST, puis comparer intégrité des deux garages et l'isolation des fichiers.
4. Valider Auth réelle propriétaire A et propriétaire B, URL signées et un parcours de pièce jointe; ne pas importer les données d'essai de TEST.
5. Préparer séparément secrets Google PROD, redirections exactes, fonctions FamilyWall et Outlook; tester le comportement réel avant d'activer les calendriers.
6. Obtenir GO explicite avec fenêtre estimée, checkpoint frais des DEUX sources après gel, plan de rollback DB + Storage + code web, puis fusion et publication. L'estimation **15–30 minutes** discutée précédemment est provisoire et pourrait être insuffisante pour deux sources réelles; revalider avant d'engager une fenêtre.

## État actuel

**NO-GO PROD.** Source de l'ami accessible; le prochain blocage réel est **l'activation de son Auth dans la PROD commune**, avant l'import, avec le test navigateur des deux propriétaires et la vérification de fichiers signés. Les tests SQL/RLS/CI déjà réussis n'ont pas à être recommencés.


## Compte du deuxième propriétaire — vérifié le 24 novembre 2026

**Preuves réelles (SELECT seulement dans la source de l'ami)** : 1 utilisateur Auth, courriel confirmé, mot de passe activé; une identité de fournisseur `email`, aucune identité OAuth externe. Aucun courriel ni hash de mot de passe n'a été extrait dans les rapports.

**Contrat du frontend TEST** : `login.html` utilise `supabase.auth.signInWithPassword`, mais n'expose pas `signUp`. `index.html` exige **exactement une** ligne `garage_members` pour l'utilisateur connecté; après authentification, il charge `garage_data` par `garage_id`. Une simple copie de sa ligne `garage_data` sans Auth/membership de destination empêchera toute connexion.

**Séquence à appliquer uniquement après GO précis sur les écritures PROD :**

1. Confirmer la méthode sécurisée de création/invitation dans **Auth PROD** avec son adresse habituelle (aucun mot de passe, hash, jeton ou clé de sa source dans GitHub). Le compte source reste fonctionnel. L'utilisateur devra pouvoir définir un nouveau mot de passe via invitation/récupération Supabase; ne pas supposer que le mot de passe ancien est portable.
2. Identifier **l'UUID Auth créé dans PROD** et le garage B prévu. Ils doivent être différents de ceux du propriétaire A. Ne pas présumer que l'UUID Auth du projet externe est transférable automatiquement.
3. Créer/valider dans la destination **exactement un** membership `owner` sur le garage B, et **aucun** membership de ce compte sur le garage A.
4. Associer la ligne `garage_data.user_id` et `garage_data.garage_id` au compte de destination; conserver **sans mélange** les 9 clients, 13 véhicules, 16 BT, 15 factures, paiements, notes, paramètres, compteurs et numéros. Appliquer le plan hors ligne `audit/s10-plan-two-garage-merge.cjs`; il exige deux propriétaires distincts mais **ne crée pas** les utilisateurs Auth.
5. Adapter les 19 chemins de Storage aux nouvelles URL privées; contrôler les octets/empreintes et les 12 références; préserver aussi les 7 objets non liés et l'objet sans propriétaire avant toute suppression éventuelle.
6. Tester avec une **vraie session du propriétaire B** : login, visibilité du seul garage B, BT/factures et URL signées. Tester ensuite que le propriétaire A ne voit pas les données B. Les droits employés sont reportés au-delà du lancement.
7. Vérifier la capacité de retour arrière sur DB, Auth, objets Storage, fonctions Edge et code GitHub Pages; ne pas lever le gel sans les deux propriétaires opérationnels.

**Garde-fou :** une instruction «next» ou «go» générique ne vaut jamais autorisation d'écrire dans PROD. La préparation de la méthode de création Auth ne crée pas le compte et n'interrompt pas le site.
