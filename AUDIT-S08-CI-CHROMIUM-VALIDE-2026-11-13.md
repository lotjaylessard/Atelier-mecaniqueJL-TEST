# S08 — Déblocage vérifié de GitHub Actions et Chromium (2026-11-13)

**Projet :** lotjaylessard/Atelier-mecaniqueJL-TEST, branche `s08/soumissions`.  
**Supabase TEST :** `nraijzsodgojkpyigefu` — production non touchée.

## Problème auparavant bloquant
Le connecteur GitHub ne retournait pas les runs déclenchés par push et les statuts de commit REST étaient vides. La présence du workflow n'était donc **pas une preuve** que la suite Node avait tourné.

## Mesure implémentée
Le workflow `.github/workflows/s08-offline-tests.yml` :
1. Exécute `node --test tests/*.test.cjs` sous Node 22.
2. Exécute `node tests/s08-chromium-offline.cjs` dans un véritable Chromium/Chrome headless de la machine GitHub Actions, avec services fictifs et portions actuelles du code `index.html`.
3. Publie dans `audit/s08-ci-latest.json` les résultats, le commit exact testé, le numéro de run et les comptes de tests.
4. Fait échouer le job si Node **ou Chromium** échoue.

La publication est un commit automatique **dans la branche TEST uniquement**. Elle est limitée à un JSON d'attestation sans données clients.

## Preuves réelles
- **Run GitHub Actions** : https://github.com/lotjaylessard/Atelier-mecaniqueJL-TEST/actions/runs/43545756801
- **Commit testé** : `c061716a8059a22bfd26c04ebffc05e9f206355c`
- **Exécution** : `43545756801`, tentative 1.
- **Job** : `offline-tests` `132296554417`, `status=completed`, `conclusion=success`.
- **Chromium hors ligne** : PASS, exit code 0. Le journal brut contient `S08 PASS: actual headless Chromium executed BT upload + account-scoped recovery UI against current index.html functions`.
- **Node** : version v22.23.4; **79 tests, 79 réussis, 0 échec**. Le journal brut confirme `# tests 79`, `# pass 79`, `# fail 0`.
- **Attestation GitHub** : `audit/s08-ci-latest.json`, dont le commit source, l'identifiant run et les comptes ont été lus et vérifiés.

## Séparation des niveaux de validation
**Réussi :** Node en vrai runner CI, Chromium headless avec données et réseau Supabase simulés, l'isolation logique du module de récupération, et les régressions SQL précédemment testées.

**NON réussi/non effectué :**
1. Navigation Chrome **authentifiée** sur le vrai site TEST (SO/BT/facture/paiement/archivage, synchro et reconnexion).
2. Téléchargement des **octets physiques réels** de `wo-files` avec une session autorisée, SHA-256, restauration isolée et comparaison.
3. Activation/vérification de la protection Supabase Auth contre mots de passe divulgués via les paramètres de TEST (un avertissement demeure).
4. Activation du verrou SQL des factures payées après la recette Chrome. Le validateur est toujours privé et non attaché aux écritures réelles.

## Contrôle de non-régression après CI
- Trois lignes `garage_data`, 12 soumissions, 6 objets Storage toujours présents dans TEST.
- Un seul trigger métier sur `garage_data`; aucun nouveau verrou de factures activé.
- Les deux snapshots actifs continuent d'être acceptés par le validateur privé en mode non-mutant.
- Security Advisor inchangé : 2 INFO sur tables privées RLS sans politique, 3 WARN pour fonctions SECURITY DEFINER du minuteur, 1 WARN Supabase Auth leaked-password protection.

**Évaluation revue : ~97 %** — le blocage de preuve GitHub CI est levé et le test de comportement dans un véritable Chromium hors ligne est confirmé. Ne pas déclarer 100 % tant que les quatre validations nommées restent absentes. Production non touchée.
