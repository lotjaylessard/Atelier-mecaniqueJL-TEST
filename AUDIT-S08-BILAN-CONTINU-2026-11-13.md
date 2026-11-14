# Audit S08 — Point de contrôle final accessible (13 novembre 2026)

**Dépôt** : `lotjaylessard/Atelier-mecaniqueJL-TEST` — branche `s08/soumissions`.  
**Projet Supabase** : TEST `nraijzsodgojkpyigefu`. **Production : non modifiée.**

## Travail supplémentaire réellement effectué

### Protection en cours de téléversement
- Une faille de concurrence a été reproduite : changement de compte pendant une opération `Storage.upload()` => l'ancien handler ajoutait une pièce jointe dans un BT après le changement.
- Correctif TEST : revalidation compte/garage après l'upload; **aucune modification du BT** si le contexte a changé. Un enregistrement de récupération de l'objet Storage est conservé sous l'identité/garage d'origine dans le stockage local, avec secours en mémoire lorsque `localStorage` échoue.
- Deuxième faille reproduite : BT devenu verrouillé par facture payée pendant l'upload => ajout possible avec l'ancien handler.
- Correctif TEST : test du verrouillage au début de l'action et juste après la réponse Storage. Si verrouillé entre-temps, aucune référence n'est ajoutée et un enregistrement local de récupération est créé.
- Scénarios de concurrence rejoués après correctifs : comportement attendu.
- Fichier `tests/s08-upload-functional-mock.test.cjs` mis à jour avec **8 tests**, dont les deux courses corrigées.

### Audit des fichiers non référencés
- 6 objets dans `wo-files`, 4 références de BT, **2 objets sans référence courante** (ni mention dans les autres données garage/soumissions). Environ **1 854 671 octets** de fichiers sans référence, tous âgés de plus de 7 jours.
- La conservation peut être voulue après retrait de la pièce jointe. **Aucune suppression automatique**.
- Test de surveillance `tests/s08-storage-orphan-inventory-readonly.sql` ajouté.

### Reproductibilité de la dépendance
- Les deux chargements CDN de `@supabase/supabase-js` sont maintenant fixés à **2.119.0**, stable publiée le 4 novembre 2026, au lieu de références flottantes.
- Test `tests/s08-supabase-cdn-version.test.cjs` ajouté.

### Résultats obtenus
- **25 tests issus de cinq suites JS** exécutés avec un harnais V8 isolé et des services simulés : 25/25 réussis (8 upload fonctionnel, 5 précontrôle upload, 4 invariants de sauvegarde, 7 inspection de sauvegarde, 1 version CDN).
  **Ce n'est pas un résultat GitHub Actions, ni un navigateur Chrome authentifié**.
- Analyse de syntaxe des six scripts intégrés de `index.html` : aucun problème détecté; le script ESM a été contrôlé en contexte async après avoir isolé l'import externe.
- **8 scripts SQL TEST** relancés avec succès : intégrité générale, isolation Storage et propriétaire, blocage des suppressions de fichiers référencés, inventaire, minuteur, paiements et liens SO→BT.
- Compteurs finaux inchangés : 3 lignes `garage_data`, 12 soumissions, 6 objets Storage; un seul vrai trigger garage_data; le validateur expérimental des factures n'est pas activé.
- Security Advisor inchangé : 2 informations RLS sur tables privées, 3 avertissements des RPC privilégiées du minuteur, 1 avertissement Auth sur protection des mots de passe compromis.

## Ce qui empêche légitimement la clôture à 100 %

1. **Exécution Chrome/Work authentifiée TEST** : SO → BT → facture, paiement partiel, verrouillage, archivage, pièces jointes, reconnexion et isolation des utilisateurs, avec résultat conservé.
2. **Vrais octets Storage** : téléchargement via autorisations appropriées, empreintes SHA-256, restauration isolée complète et comparaison des objets.
3. **Preuve CI GitHub Actions** : fichier workflow présent mais outils connectés ne renvoient aucun run ni statut exploitable; exécution non confirmée.
4. **Supabase Auth** : activation et vérification de la protection contre mots de passe compromis depuis la configuration Auth du projet.
5. **Verrouillage serveur réel des factures** : validateur privé et temporaire testé, mais non connecté aux véritables écritures en attendant la recette Chrome. Une facture payée/archivée TEST présente par ailleurs une incohérence historique déjà documentée, non corrigée.

## Consigne de sécurité
- Ne pas utiliser la production comme terrain de test.
- Ne pas activer le trigger facture avant validation du parcours UI.
- Ne jamais supprimer automatiquement les deux objets Storage sans référence.
- Les traces de fichiers téléversés dont la session a changé exigent une procédure de récupération vérifiée pour éviter de perdre des fichiers.
- Ne pas annoncer 100 % tant que les preuves ci-dessus sont absentes.

**Audit actuellement ~96 % (estimation), avec tests supplémentaires réalisés et preuves restantes identifiées.**
