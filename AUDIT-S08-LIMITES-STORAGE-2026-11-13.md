# Audit S08 — État des limites de téléversement (2026-11-13)

## Vérifications réellement exécutées sur Supabase TEST
- Le bucket Storage `wo-files` est **privé** (`public=false`).
- Six objets enregistrés, tous avec propriétaire identifié et taille déclarée positive.
- Les quatre pièces jointes référencées aux BT étaient précédemment accessibles selon les politiques propres aux comptes.
- Une règle existante bloque déjà la suppression ou le remplacement d'un fichier toujours référencé par un BT.
- Le bucket a `file_size_limit=NULL` et `allowed_mime_types=NULL` : **aucune limite personnalisée pour ce bucket**.
- Le formulaire de téléversement actuel utilise `sb.storage.from("wo-files").upload(filePath,file)` sans vérifier `file.size` avant l'envoi.
- Nouveau test `tests/s08-storage-bucket-safety-readonly.sql` exécuté avec succès.
- Contrôle global `tests/s08-release-readonly-integrity-gate.sql` et deux régressions Storage relancés avec succès.
- La présence éventuelle de plafonds de service Supabase distincts n'est pas évaluée par ce contrôle; absence de limite personnalisée ne signifie pas absence de limites côté plateforme.

## Recommandation de phase suivante
Choisir après tests Chrome une limite explicite raisonnable pour les fichiers joints, alignée côté navigateur et bucket, ainsi qu'une politique de types autorisés. Éviter de fixer arbitrairement une limite susceptible de bloquer des documents habituellement envoyés au garage.

## Critères de fin d'audit S08 encore ouverts
1. Octets physiques téléchargés et empreintes SHA-256, restauration isolée complète.
2. Recette Chrome sur TEST authentifié.
3. Résultat confirmé des tests GitHub Actions.
4. Réglage Auth concernant les mots de passe compromis.
5. Tests Chrome avant activation du verrouillage serveur des factures payées.

**Aucune donnée client, facture, pièce jointe physique ou configuration de bucket n'a été modifiée. Production intacte.**
