# S08 — Contrôle Storage des accès hérités (2026-11-13)

## Branche et environnement
- GitHub : lotjaylessard/Atelier-mecaniqueJL-TEST, branche s08/soumissions
- Supabase : TEST nraijzsodgojkpyigefu
- Production : aucune modification.

## Correction appliquée
La fonction privée et privilégiée `s08_private.can_read_legacy_file(text)` exige maintenant :
1. Un utilisateur Supabase authentifié.
2. Une autorisation enregistrée précisément pour l'objet Storage demandé.
3. Une référence **encore présente** dans une pièce jointe d'un BT de ce même utilisateur, dans `public.garage_data`.

Avant cette correction, l'autorisation historique seule était suffisante même si le lien à un BT était ultérieurement retiré. Aucun objet Storage ou BT n'a été modifié.

## Contrôles exécutés
- Migration TEST appliquée avec succès.
- `tests/s08-storage-owner-isolation-live.sql` : réussi.
- `tests/s08-storage-manifest-metadata.sql` : réussi.
- `tests/s08-owner-isolation-live.sql` : réussi.
- `tests/s08-legacy-storage-live-reference.sql` : réussi avec session authenticated simulée.
- Bilan inchangé : 3 lignes garage_data, 12 soumissions, 6 objets Storage, une autorisation historique explicite.
- Supabase Security Advisor inchangé : 2 INFO sur RLS sans politique (tables privées), 3 WARN fonctions SECURITY DEFINER nécessaires au minuteur, 1 WARN protection des mots de passe divulgués.

## Validation à ne pas confondre
La vérification de la fonction et de Storage en SQL ne remplace pas un téléchargement authentifié des **octets réels** de chaque fichier, ni une restauration avec de véritables fichiers, ni les essais Chrome. GitHub Actions n'est toujours pas confirmé.

## Restant avant 100 %
- Vérification de Chrome sous compte TEST, dont paiement partiel, archivage, sauvegarde et reconnexion.
- Contrôle octet-à-octet SHA-256 des pièces jointes et restauration complètement isolée.
- Résultat confirmé des workflows automatisés GitHub Actions.
- Réglage Supabase Auth contre les mots de passe compromis.
- Validation fonctionnelle du verrouillage serveur des factures avant de l'attacher aux vraies opérations.

**Ne pas conclure à 100 % avant ces preuves.**
