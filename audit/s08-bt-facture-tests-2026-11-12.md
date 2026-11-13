# Audit S08 — BT → facture : tests isolés du 12 novembre 2026

**Dépôt :** lotjaylessard/Atelier-mecaniqueJL-TEST  
**Branche :** s08/soumissions  
**Projet Supabase :** Atelier-mecaniqueJL-TEST uniquement  
**Fonction préparatoire :** `public.s08_finalize_bt_invoice_unified_staged`  
**Statut :** NON ACTIVÉE dans le navigateur; fonctions d'écriture interdites à `authenticated` et `anon`.

## Méthode des tests

Chaque test a utilisé une **copie SQL de la définition réelle** de la RPC unifiée, renommée `pg_temp.*` et ciblant une **table temporaire `pg_temp.garage_data` contenant seulement des clients, véhicules, BT et factures fictifs**. L'identité simulée était injectée dans la transaction SQL; toutes les expériences étaient encadrées par `BEGIN ... ROLLBACK`.

**Aucune ligne de `public.garage_data`, aucun compte Auth ni aucune facture du garage n'a été créé ou modifié dans ces essais.** Ces tests exercent le corps SQL (y compris son `UPDATE` atomique) mais ne constituent **pas** une validation complète des droits RLS et du comportement PostgREST d'une session cliente réelle.

## Résultats réussis

1. Simulation `dry_run=true` : pas d'écriture, version inchangée.
2. Simulation `dry_run=null` : pas d'écriture, version inchangée.
3. Facture valide : création d'**une seule** facture, BT passé de `en_cours` à `termine`, kilométrage fictif mis à jour dans **une seule transaction**, version incrémentée de 7 à 8.
4. Deuxième tentative sur la version périmée : refus, sans doublon.
5. Pièce : total de ligne modifié : rejet.
6. Main-d'œuvre : total de ligne modifié : rejet.
7. TPS modifiée sans réconcilier le total : rejet.
8. TPS modifiée avec total réconcilié artificiellement : rejet selon le taux du garage.
9. Rabais inattendu à la création : rejet.
10. Numéro de BT différent dans la facture : rejet.
11. Identifiant de facture `null` : rejet.
12. Version cloud attendue incorrecte : rejet.
13. Facture déjà marquée payée : rejet.
14. Kilométrage facture différent du BT : rejet.
15. Identifiant interne de facture déjà utilisé ailleurs : rejet.
16. Numéro de BT dupliqué : rejet.
17. Facture minuteur fictive : montant exact confirmé conservé même différent de `heures × tarif`; création réussie.
18. Minuteur : `confirmedMs` altéré : rejet.
19. Minuteur : `timerSessionId` altéré : rejet.
20. BT sans `clientId` : rejet après ajout d'un contrôle serveur.
21. BT sans `vehicleKm` : rejet après ajout d'un contrôle serveur.

Tous les scénarios ont utilisé des données fictives. Les requêtes SQL ont confirmé les résultats attendus, puis les transactions ont été annulées (`ROLLBACK`).

## Correction serveur supplémentaire

Migration TEST : `s08_stage_require_linked_client_vehicle_and_km` sur la fonction préparatoire unifiée.

Ajouts : refuser le BT si son client/véhicule lié manque, refuser un kilométrage absent, nul ou non numérique, refuser un client ou véhicule lié devenu introuvable plutôt que d'ignorer silencieusement la mise à jour du kilométrage.

Une nouvelle simulation fictive après cette migration a vérifié la réussite normale, puis le rejet du client manquant et du KM manquant. Permissions `EXECUTE` vérifiées : `authenticated=false` et `anon=false` pour les trois RPC préparatoires.

## Points bloquants avant activation

- **Test de deux requêtes concurrentes effectué en environnement isolé** : une seule transaction a réussi, la deuxième a été rejetée sur la version devenue périmée; une seule facture enregistrée. Réaliser tout de même l'essai de bout en bout via deux navigateurs authentifiés avant l'activation.
- **Pas encore de test PostgREST / RLS avec une authentification client réelle**.
- **KM saisi au moment de terminer un BT** : le serveur accepte désormais le KM final explicite fourni dans la facture et le conserve atomiquement dans le BT et le véhicule, après contrôle anti-régression. Il reste à adapter et vérifier le parcours navigateur (sans sauvegarde locale préalable).
- Vérification de compatibilité nécessaire pour les BT hérités : lecture seule sur TEST a compté 6 BT en cours, dont 1 sans `vehicleKm` stocké (aucun sans `clientId` ou `vehicleId`).
- **Après la RPC** : le navigateur devra recharger l'état serveur confirmé, ne pas effectuer d'anciennes sauvegardes locales asynchrones et traiter une réponse réseau ambiguë sans rejouer une création à l'aveugle.
- **Le bouton « Terminé » reste inchangé**. Ne pas ouvrir les permissions des RPC ni basculer le bouton tant que ces points ne sont pas résolus.

## Protection de la production

Seul Supabase TEST et le dépôt TEST ont été utilisés. Les fonctions préparatoires ne sont pas exécutables par l'application. Ce rapport n'est pas une confirmation de mise en production.

## Complément : test de concurrence réelle en sandbox isolée

Pour tester deux connexions séparées, un schéma SQL privé temporaire `s08_isolated_test_1112` a été créé dans Supabase TEST avec une table **entièrement fictive**, une copie de la RPC unifiée et un identifiant de session simulé. Aucune table métier n'a été modifiée.

Deux appels distincts à la même RPC, avec la même version attendue (7), ont été envoyés **en parallèle** :

- **Appel 1 :** réussi, version 8, facture FA-RACE-1112 créée.
- **Appel 2 :** refusé (`Garage missing or version changed`).
- Contrôle après les deux appels : **version 8, une seule facture, BT terminé, KM 1500**.
- Le schéma de test et les données fictives ont ensuite été intégralement supprimés. Confirmation SQL : `isolated_fixture_removed=true`.

Ce résultat valide la protection contre les deux demandes concurrentes au niveau du SQL. Il ne teste pas encore les déconnexions réseau du navigateur, l'exécution via PostgREST avec RLS, ni la récupération après une réponse ambiguë.

## Complément : kilométrage final atomique

Migration TEST : `s08_staged_atomic_invoice_final_km_saved_to_bt`.

- La fonction staged accepte `p_invoice.vehicleKm` comme **KM final validé**, même si `wo.vehicleKm` est absent ou ancien dans le document cloud.
- Le nouveau kilométrage est écrit à la fois dans `workorders[].vehicleKm` et dans `clients[].vehicles[].km`, avec la facture, pendant **un seul UPDATE**.
- Elle refuse les KM nuls/invalides et une valeur inférieure au dernier KM du véhicule.
- Test sur copie de la vraie fonction dans `pg_temp` : BT initial sans champ KM, véhicule 1500 km, facture à 1550 km → succès, BT 1550, véhicule 1550, 1 facture, version 5→6.
- Contre-test : tentative de 1450 km contre 1500 km → refus `Odometer decreased`.
- Essais entièrement fictifs et annulés par `ROLLBACK`, sans changement aux dossiers existants.

**À faire :** passage client JS sur le nouvel appel atomique, après vérification Chrome et RLS authentifié. Le bouton existant reste inchangé.

## Préparation du branchement navigateur (non activée)

Commit `0957322f` : le fichier `index.html` de la branche TEST contient désormais un chemin client atomique **désactivé par défaut** (`S08_BT_ATOMIC_TEST_ENABLED = false`). Le comportement existant du bouton `Terminé` n'est donc pas modifié.

Ce chemin prépare la facture avec le calcul actuel, vérifie la synchronisation, effectue la RPC en simulation, revalide le contexte puis effectue la RPC d'écriture. Il empêche les anciennes sauvegardes locales pendant l'opération, recharge l'état Supabase confirmé et contrôle la présence de la nouvelle facture et du BT terminé. En cas de réponse ambiguë, aucun second essai automatique n'est déclenché.

**Vérifications en place :**
- Fichier relu depuis GitHub après commit : nouvelle fonction, drapeau `false` et appel conditionnel présents.
- Permissions Supabase contrôlées une seconde fois : toutes les fonctions préparatoires d'écriture restent interdites à `authenticated` et `anon`.
- Correction SQL du KM final testée sur un BT fictif n'ayant aucun KM initial (KM final 1550, véhicule initial 1500) et contre-test de régression (1450 refusé), avec `ROLLBACK`.

**Restent obligatoires avant activation :** validation du script et du comportement dans Chrome/Codespace, confirmation réelle de la connexion RLS à la RPC, et tests d'intégration UI avec un BT fictif. Ne pas activer simplement le drapeau sans accorder et tester explicitement les droits d'exécution de la seule RPC unifiée; ne jamais donner accès aux deux anciennes RPC.

## Audit de préparation Chrome — corrections ciblées supplémentaires

- Commit `f9067be1` : lecture du KM du formulaire dans une variable locale, sans toucher au BT en mémoire avant le contrôle de version/cloud. La facture préparatoire contient le KM final; sur l'ancien chemin le KM du BT n'est changé qu'après les contrôles. Cela évite de faire échouer la vérification de snapshot simplement parce que le mécanicien modifie le KM en terminant.
- Commit `c45b20be` : le futur chemin atomique désactivé sauvegarde une copie de récupération des modifications locales apparues pendant la RPC **avant** de réhydrater l'état Supabase. Il interdit alors le rechargement automatique qui effacerait ces modifications. Cette protection couvre également le chemin d'erreur réseau.
- Vérification statique après commit : `S08_BT_ATOMIC_TEST_ENABLED=false`, préparation KM sans mutation précoce, inclusion du KM final dans la facture, copie de récupération et rechargement sécurisé présents; les trois RPC d'écriture sont toujours interdites à `authenticated` et `anon`.

**Limite de validation :** pas de session Chrome/Codespace accessible dans l'outil de cette conversation. Tests visuels et PostgREST avec JWT réel non exécutés. Ne pas décrire cette préparation comme une activation ou une validation complète du navigateur.

**Étape UI à exécuter lorsqu'une session Chrome TEST est disponible :** faire l'essai avec BT fictif, changer le KM juste avant Terminé, vérifier le statut cloud/sauvegardes, essayer double clic et un autre onglet, contrôler l'absence de doublon et le rechargement après interruption réseau; seulement ensuite décider du déverrouillage de la RPC unifiée.

## Série de tests sans navigateur connecté (exécutée avant la validation finale)

**Cible :** dernière version `index.html` de `s08/soumissions`, avec la nouvelle transaction toujours désactivée.

### Exécution directe du JavaScript réel du dépôt, avec objets fictifs

- Extraction et analyse syntaxique des blocs `<script>` du fichier : les quatre blocs classiques inline (dont le principal) se compilent avec le parseur ECMAScript V8. Le bloc contenant des `import` est un module et ne doit pas être analysé comme script classique.
- Extraction de la vraie fonction `finishWorkOrder`, exécutée dans un contexte de test à données fictives : **5 scénarios réussis**.
  1. Deux clients homonymes : le véhicule est identifié par `clientId/vehicleId`, pas par son nom.
  2. Véhicule lié introuvable : bouton bloqué.
  3. KM inférieur à celui de la fiche véhicule : bloqué.
  4. KM non fini (`Infinity`) : bloqué.
  5. Facture existante pour le même BT : bloqué.
  Dans tous les cas, le BT en mémoire n'a pas été modifié prématurément.
- Extraction de la vraie fonction `s08FinishWorkOrderAtomicTest`, exécutée avec des appels Supabase simulés : **5 scénarios réussis**.
  1. Simulation puis écriture réussies → un seul rechargement et ouverture de facture.
  2. Simulation refusée → aucune tentative d'écriture.
  3. Réponse réseau ambiguë → relecture cloud, pas de seconde création.
  4. Note locale non synchronisée arrivée pendant l'écriture → copie de récupération, aucun rechargement destructeur.
  5. Synchronisation déjà en attente → aucun appel RPC.
- Un double enregistrement de copie de récupération a été découvert dans le cas 4. **Correction commit `685d1b5c`** : une seule copie enregistrée malgré le passage par `catch`. Contre-test direct de la fonction : 1 copie, 0 recharge, 2 appels (simulation + écriture).
- **Correction commit `1d9d5584`** : la validation KM du bouton utilise maintenant les vrais identifiants client/véhicule; aucune recherche ambiguë par nom ou modèle.

### RLS / permissions en transaction annulée

- Test de rôle `authenticated` avec sujet JWT entièrement fictif et droit `EXECUTE` accordé **uniquement dans une transaction SQL temporaire**, puis `ROLLBACK`.
- Le rôle fictif n'a pas pu lire les données d'un garage absent/non lié : RPC refusée.
- Vérification après `ROLLBACK` : les trois RPC préparatoires de facturation restent interdites à `authenticated` et `anon`. Aucune permission n'a été laissée ouverte.

**Portée et limite :** ces tests couvrent réellement le code JavaScript extrait, les protections SQL et un rôle authentifié fictif, mais **pas** le fonctionnement complet du fichier HTML rendu dans Chrome avec une connexion utilisateur réelle, ni les vrais appels REST Supabase depuis le navigateur.

**Dernier blocage nécessitant un environnement utilisateur :** Chrome/Codespace connecté au garage TEST (jamais production). Ne pas activer `S08_BT_ATOMIC_TEST_ENABLED` avant tests d'acceptation et autorisation contrôlée de la seule RPC unifiée.

## Validation du BT test Mazda Miata depuis Chrome — 12 novembre 2026

L'utilisateur a présenté la fiche du BT fictif `BT-TF-2026-11-03-1` (TEST FACTURE, Mazda Miata 1999) avec 2 lignes minuteur : 2,21 CAD et 97,93 CAD, soit 100,14 CAD avant taxes.

Contrôle lecture seule en Supabase TEST : le BT était toujours en cours, sans facture, `vehicleKm` absent dans l'ancien BT et `vehicleId` enregistré ne correspondait plus à la seule Mazda Miata présente dans les véhicules du client. Le modèle, l'année et le client étaient cohérents. Aucun autre véhicule n'était présent sur cette fiche client.

Réparation **ciblée uniquement sur le BT fictif** :
- Transaction SQL protégée par version CAS `310`, `SELECT FOR UPDATE`, unicité du numéro BT et du véhicule, correspondance client + année + marque + modèle, statut `en_cours` et absence de facture.
- Seul `workorders[BT-TF-2026-11-03-1].vehicleId` a été remis vers l'identifiant de l'unique véhicule existant de ce client.
- Version cloud passée de **310 à 311**. Aucune facture ni ligne de main-d'œuvre, pièce, note, paramètre ou kilométrage n'a été modifié.
- Nouvelle vérification : BT toujours `en_cours`, nombre de factures 0, KM enregistré dans le BT toujours absent (ancien format), véhicule lié à 12 500 km.

**Validation de la RPC staged sur le véritable BT TEST, sans écriture :**
- Création du JSON de simulation avec les deux lignes minuteur exactes et les montants TPS/TVQ calculés depuis les paramètres du garage.
- Simulation `p_dry_run=true` réussie sur la version cloud **311**.
- Test supplémentaire avec le rôle SQL `authenticated` et le sujet de la session du garage simulé en transaction : les droits `EXECUTE` n'ont été accordés que dans `BEGIN ... ROLLBACK`; la lecture RLS du garage et l'appel de la RPC en simulation ont réussi.
- Après `ROLLBACK`, contrôle confirmé : `authenticated=false`, `anon=false` pour **les trois fonctions d'écriture préparatoires**.

**Prochaine étape côté navigateur :** l'utilisateur doit actualiser Chrome pour récupérer le changement cloud version 311 **sans modifier/sauvegarder son ancienne page avant**. Vérifier le badge Synchronisé et le BT. Le clic `Terminé` n'est toujours pas autorisé dans l'essai atomique désactivé. Tests visuels navigateur de la RPC atomique avec écriture à faire seulement après activation contrôlée et vérification des permissions de la seule fonction unifiée.

## Pilote BT → facture activé sur TEST — portée strictement limitée

- Migration `s08_test_pilot_scoped_unified_invoice_to_fictitious_bt` : la seule RPC unifiée refuse tout appel dont le compte, le garage, l'ID de BT ou le numéro de BT ne correspondent pas au dossier fictif `BT-TF-2026-11-03-1`.
- Migration `s08_enable_scoped_test_pilot_rpc_for_authenticated` : `EXECUTE` autorisé à `authenticated` **uniquement** sur la RPC unifiée munie de cette barrière. Les deux anciennes RPC restent inaccessibles et `anon` reste interdit.
- Vérification sous rôle `authenticated` : dossier différent → erreur `S08 TEST pilot restricted...`; dossier pilote réel → simulation `p_dry_run=true` réussie sans aucune écriture; changements d'autorisations temporaires antérieurs annulés.
- Commit `60a1dbf7` : `S08_BT_ATOMIC_TEST_ENABLED=true` dans `index.html` TEST, mais **seulement pour ce numéro de BT**. Les autres BT conservent l'ancien comportement. La fonction client refuse également de s'exécuter sur un autre numéro de BT.
- Après commit : analyse syntaxique de 5 scripts JS classiques inline sans erreur; vérification SQL de la présence de la barrière, permissions `authenticated=true` uniquement sur la RPC unifiée, `anon=false` partout, anciennes RPC fermées.

**Aucun clic de fermeture effectué lors de l'activation** : le BT test doit rester `en_cours` et sans facture jusqu'à l'essai guidé depuis Chrome.

**Acceptation attendue dans Chrome TEST** : `git pull` sur `s08/soumissions`, rafraîchir le navigateur, ouvrir `BT-TF-2026-11-03-1` (TEST FACTURE, Mazda Miata 1999), vérifier l'état Synchronisé et 12 500 km, puis appuyer une seule fois sur Terminé et accepter la confirmation. Vérifier la facture, les deux montants de minuteur, la TPS/TVQ, l'état du BT, le KM enregistré et absence de doublon après rafraîchissement. En cas d'erreur, ne pas cliquer de nouveau; collecter capture du message et inspecter état serveur d'abord.

**Important :** ce pilote ne vaut pas activation générale ni autorisation de production.

## Test navigateur pilote effectivement réussi — 12 novembre 2026, ~20:11 (Québec)

L'utilisateur a effectué `Terminé` sur le seul BT fictif autorisé `BT-TF-2026-11-03-1` depuis Chrome/Codespace TEST. Le premier contrôle du KM avait échoué car `finishWorkOrder` cherchait l'ancien champ DOM `woVehicleKmInput` tandis que le formulaire actuel utilise `woKmInput`. Correctif ciblé dans `index.html`, commit `e9298e7e`, validé en test JS avant le nouvel essai.

Après actualisation, le dialogue de confirmation s'est affiché et l'utilisateur a confirmé. Chrome a immédiatement ouvert la facture `FA-TF-2026-11-03-1` : 2 lignes minuteur (2,21 + 97,93 CAD), sous-total 100,14, TPS 5,01, TVQ 9,99, total **115,14 CAD**, statut impayée.

Lecture directe en base Supabase TEST **après** fermeture :
- Version du garage : **314** (avant : 313).
- BT : `termine`, `vehicleKm=12500`, `completedAt=2026-11-13T01:11:36.027Z`.
- Nombre de factures liées : **exactement 1**.
- Facture : `FA-TF-2026-11-03-1`, statut `unpaid`, KM 12500, sous-total 100,14, TPS 5,01, TVQ 9,99, total 115,14.
- Lignes minuteur et leurs `timerSessionId` et `confirmedMs` ont été conservés intacts.
- Fiche véhicule liée : KM 12500.

**Le premier essai réel de transaction atomique est donc réussi et confirmé serveur + interface, sans duplication.**

Mesures de clôture du pilote immédiatement après vérification :
- Migration TEST `s08_close_completed_fictitious_bt_pilot_rpc` : révocation `EXECUTE` à `authenticated` sur la RPC unifiée.
- Commit `f330d46e` : `S08_BT_ATOMIC_TEST_ENABLED=false` dans `index.html` TEST.
- Contrôle post-changement : les trois RPC préparatoires sont interdites à `authenticated` et `anon`, drapeau client désactivé.
- Le bouton `Terminé` des autres BT n'a pas été migré à la RPC atomique, et **la production n'a pas été touchée**.

**Prochaine phase éventuelle** : validation supplémentaire des scénarios de reprise UI (réseau, autres BT fictifs), puis plan d'activation générale TEST et seulement après revue indépendante de sécurité/production. Ne pas conclure que les tests sur tous les BT sont finis à partir de ce seul pilote.

## Récupération après réponse RPC ambiguë — tests automatisés après le premier pilote réel

- Commit `bdaf69ac` : `s08FinishWorkOrderAtomicTest` contient désormais une fonction locale `s08OpenConfirmedInvoice` qui ne réussit qu'après avoir trouvé simultanément la facture attendue **et** le BT terminé dans l'état cloud rechargé.
- En cas de perte de réponse de la RPC d'écriture, le client relit le cloud sans deuxième écriture. Si le serveur a bien enregistré la facture, l'interface ouvre celle-ci et avertit que l'enregistrement a été récupéré; sinon, elle maintient l'état incertain et exige une vérification avant de recommencer.
- Les protections préexistantes de sauvegarde d'une copie des modifications locales non synchronisées ont été conservées.
- Commit `49546a24` : ajout du test réexécutable `audit/s08-bt-atomic-recovery.test.cjs`, qui extrait la **vraie fonction JS** d'`index.html` et simule les réponses serveur avec des données fictives.
- **7 scénarios exécutés avec succès en V8** : fonctionnement normal; RPC écrite mais accusé de réception perdu; accusé perdu sans écriture serveur; simulation refusée; synchronisation locale en attente; modification locale en plein appel (exactement une copie de récupération et zéro rechargement destructeur); rechargement réseau impossible.
- Aucun de ces scénarios n'appelle véritablement Supabase : test local de la logique JS et des effets de bord, pas test Chrome de coupure physique.
- Commit `8884dfd0` : suppression du message périmé « tests serveur/concurrence encore requis » à la fin du test arithmétique, puisque ces tests ont été réalisés et documentés.

**Statut sécurisé après ces modifications** : le drapeau d'activation demeure `false`; l'autorisation SQL `EXECUTE` de la RPC unifiée demeure révoquée pour `authenticated` et `anon`. Aucun nouveau BT/facture créé en base.

**Avant extension à l'ensemble de TEST** : tester le redémarrage du navigateur pendant/après un appel réseau sur un BT *fictif indépendant*, réexaminer l'autorisation de la RPC (actuellement limitée au BT pilote déjà terminé), et activer le chemin général uniquement après vérification d'authentification/RLS et des comportements de toutes les catégories de BT. Ne pas activer en production.

## Tests supplémentaires — double clic, prévalidation et état local

- Nouveau test réexécutable : `audit/s08-bt-double-submit.test.cjs`, commit `54278b4a`.
- La suite extrait le vrai code `finishWorkOrder` de `index.html`; les dépendances et le serveur sont simulés et **aucune donnée réelle n'est modifiée**.
- **3 scénarios exécutés avec succès en V8** :
  1. Deux clics quasi simultanés sur `Terminé` pendant une attente du serveur : **une seule confirmation et une seule vérification cloud**, second clic ignoré. Si la version cloud a changé, refus propre, KM en mémoire inchangé et verrou libéré.
  2. Modification/sauvegarde locale non confirmée : blocage avant tout contrôle réseau et aucun changement de KM.
  3. Kilométrage non valide (valeur non finie) : refus avant confirmation et aucun changement de BT.

À exécuter dans Codespace après `git pull` seulement si une vérification manuelle est nécessaire : `node audit/s08-bt-double-submit.test.cjs`. La nouvelle transaction atomique reste **désactivée** pour les comptes, et la production est inchangée.

Il reste pour l'activation générale TEST un scénario navigateur réel d'interruption de réseau sur un **nouveau** dossier fictif, ainsi que la revue des cas de BT historiques et des anciennes fonctions; aucun test automatique ne peut prouver seul l'intégration utilisateur réelle.

## Vérification globale des BT actifs avant prochain jalon

- Vérification de l'état TEST actuel **en lecture seule** : 5 BT en cours; pour chacun : numéro unique, client et véhicule liés, aucun doublon de facture, tableaux pièces/main-d'œuvre valides, paramètres de taxes lisibles.
- Audit des lignes : pièces, heures, taux et lignes issues du minuteur vérifiés; aucune quantité/tarif/minuteur mal formé détecté dans ces 5 BT.
- **5 simulations de facturation SQL réussies**, une pour chaque BT actif, en utilisant une copie temporaire du corps réel de la RPC unifiée, avec l'ancienne limite au BT pilote désactivée **uniquement dans la copie transactionnelle**. Pour chaque BT : construction d'une facture fictive, deux taxes indépendantes et `p_dry_run=true`; aucun appel d'écriture.
- Ces simulations ont été exécutées dans une transaction `BEGIN ... ROLLBACK`; la RPC installée sur Supabase TEST et ses permissions restent inchangées.
- Nouveau script GitHub réexécutable `audit/s08-active-bt-readiness.sql` (commit `fadc8c7c`) : audit purement SELECT. Après lecture et exécution du fichier depuis GitHub : **5 sur 5 `structure_ready=true`**, version du garage 314.

**Important :** la compatibilité structurelle en SQL ne prouve pas les effets UI d'une coupure de réseau physique. Le prochain jalon reste un essai Chrome de reprise, idéalement sur un dossier fictif dédié, puis l'activation générale du mécanisme atomique dans TEST; on ne touche pas à la production avant les tests complets de fiabilité et un accord explicite.

## Pilote navigateur — récupération après accusé de réception simulé perdu (12 novembre 2026)

Préparation TEST exclusivement :
- Nouveau BT **100 % fictif** `BT-S08-2026-11-12-1` créé dans le garage TEST, pour le client fictif TEST FACTURE et la Mazda Miata déjà utilisés pour les tests. Une ligne de main-d'œuvre fictive 0,5 h × 90 $ = 45,00 $ avant taxes, KM 12 500. Aucune facture créée à cette étape. Garage version 314 → 315.
- Migration `s08_test_network_recovery_restrict_rpc_to_new_fictitious_bt` : la RPC unifiée restreint le compte, le garage, le **nouvel ID BT** `1794530099001` et le **nouveau numéro** `BT-S08-2026-11-12-1`. Les autres BT restent interdits sur ce nouveau chemin.
- Simulation SQL dry-run avec rôle `authenticated` et vrai dossier fictif réussie en transaction `ROLLBACK`.
- Migration `s08_test_enable_one_fictitious_network_recovery_rpc` : seule la fonction unifiée restreinte reçoit EXECUTE pour authenticated; deux anciennes RPC et anon restent bloquées.
- Commit `54508b55` sur `index.html` : branche atomique activée uniquement pour `BT-S08-2026-11-12-1`. Injection temporaire `S08_BT_TEST_LOSE_ACK_AFTER_SUCCESS=true` : **une fois** que le serveur a validé et répondu succès, le client lance une erreur fictive « accusé réseau perdu » pour exercer la récupération. Le serveur ne reçoit **aucune seconde écriture**; le navigateur doit relire le cloud, retrouver le BT terminé et une facture, afficher un avertissement et ouvrir la facture.
- Cette simulation exerce le cas d'une **réponse perdue**, mais **ne constitue pas une vraie coupure physique du réseau**. Ne jamais demander de couper Internet ou de recharger pendant la transaction.
- Syntaxe des 5 scripts JS contrôlée sans erreur; droits RPC et enregistrement avant essai vérifiés (version 315, BT en cours, zéro facture).
- Acceptation navigateur à venir : `git pull origin s08/soumissions`, recharger Chrome, ouvrir le BT fictif, confirmer 12 500 km et statut Synchronisé, cliquer une seule fois sur Terminé; vérifier alerte de récupération puis facture `FA-S08-2026-11-12-1` d'environ 51,74 $.

**Mesure impérative après l'essai :** vérifier le serveur, désactiver `S08_BT_ATOMIC_TEST_ENABLED` et l'injection, révoquer EXECUTE à authenticated, puis confirmer toutes permissions interdites.

## Résultat du pilote d'accusé de réception perdu — 12 novembre 2026 ~20:42 Québec

Capture utilisateur : dialogue « Facture confirmée sur Supabase après interruption de connexion. Aucune deuxième facture n'a été créée. » affiché après le clic Terminé sur `BT-S08-2026-11-12-1`. Le badge en arrière-plan indique temporairement « Cloud indisponible » alors que le dialogue JavaScript bloque le rendu régulier. À revérifier lorsque la boîte de dialogue est fermée; ne pas confondre le badge affiché pendant l'alerte synchrone avec une panne Supabase.

Vérification immédiatement après le test côté Supabase TEST :
- Garage version **316** (avant : 315).
- `BT-S08-2026-11-12-1` : statut `termine`, KM `12500`, `completedAt=2026-11-13T01:42:25.993Z`.
- Une seule facture liée : `FA-S08-2026-11-12-1`, impayée, 0,5 h × 90 $ = 45,00 $, TPS 2,25 $, TVQ 4,49 $, total **51,74 $**, kilométrage 12500.
- Kilométrage de la fiche véhicule 12500, inchangé.

Retrait immédiat du mode pilote :
- Migration `s08_close_successful_network_ack_pilot` : EXECUTE révoqué à `authenticated` sur RPC atomique.
- Commit `e1635d31` : `S08_BT_ATOMIC_TEST_ENABLED=false` et `S08_BT_TEST_LOSE_ACK_AFTER_SUCCESS=false` dans `index.html`.
- Vérification SQL : les trois RPC S08 interdites à `authenticated` et `anon`.
- **Aucune intervention sur la production.**

Conclusion précise : la simulation d'un accusé de réception perdu **après une écriture effectivement réussie** a passé l'essai navigateur et serveur. Ce n'est pas un test de coupure Internet physique. La généralisation de l'activation atomique n'est pas encore réalisée; garder les permissions fermées jusqu'au prochain plan d'activation générale TEST.
