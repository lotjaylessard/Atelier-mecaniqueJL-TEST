# S08 — Une seule session Codespaces pour l'import en quarantaine

**Statut : préparation uniquement.** Les fichiers privés ne sont pas dans GitHub et la restauration applicative complète n'est pas autorisée.

## Préparation sur le laptop Windows (PowerShell)
La sauvegarde réelle vérifiée est dans `C:\Test Jeremy\S08-TEST`. Créer une archive ZIP **de la sauvegarde sans erreurs**, sans utiliser OneDrive :

```powershell
$base = 'C:\Test Jeremy\S08-TEST'
$backup = Get-ChildItem -LiteralPath $base -Directory -Filter 'garage-s08-physical-*' |
  Where-Object {
    $m = Get-Content -LiteralPath (Join-Path $_.FullName 'manifest.json') -Raw | ConvertFrom-Json
    @($m.failed).Count -eq 0 -and $m.fileCount -eq 6
  } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $backup) { throw 'Sauvegarde valide introuvable' }
$zip = Join-Path $env:USERPROFILE 'Downloads\s08-transfer.zip'
Compress-Archive -LiteralPath (Join-Path $backup.FullName 'manifest.json'),(Join-Path $backup.FullName 'garage-data.json'),(Join-Path $backup.FullName 'files') -DestinationPath $zip -Force
Write-Host "Archive prête : $zip"
```

> Le ZIP contient des informations de clients : ne pas le joindre à une issue, un commit, une conversation publique ou une GitHub Action. L'import vers Codespaces transfère les données dans l'environnement cloud privé Codespaces; respecter les exigences de confidentialité du garage.

## Une seule intervention Codespaces
1. Démarrer Codespaces uniquement pour cette session. Vérifier `git branch --show-current` = `integration-finale` et `git pull --ff-only`.
2. Dans l'Explorateur VS Code, téléverser `s08-transfer.zip` **à la racine du workspace** `Atelier-mecaniqueJL-TEST`. Le fichier est ignoré par `.gitignore`.
3. Dans le terminal, exécuter :

```bash
sudo -n /bin/bash -c 'pg_ctlcluster 15 main start' &&
python3 audit/s08-stage-archive.py s08-transfer.zip
```

4. Attendre `S08_STAGING_OK` puis `S08_ARCHIVE_OK`. La table locale `s08_quarantine.snapshots` contiendra le JSON partiel, **pas** une restauration du système.
5. Vérifier sans modifier les données :

```bash
sudo -n /bin/bash -c "runuser -u postgres -- psql -X -d atelier_s08_restore -c \"SELECT sha256,source,jsonb_array_length(payload->'quotes') AS quotes FROM s08_quarantine.snapshots;\""
```

6. Retirer le ZIP du workspace (copie privée extraite conservée dans `~/.local/share/atelier-s08-private`), arrêter PostgreSQL et **arrêter Codespaces** pour économiser le quota :

```bash
rm -f -- s08-transfer.zip
sudo -n /bin/bash -c 'pg_ctlcluster 15 main stop'
```

## Interdictions / limites
- Ne pas committer `s08-transfer.zip` ou le dossier extrait. Les sauvegardes contiennent des données personnelles.
- Ne pas utiliser `pg_restore`, `psql` ou ce script contre Supabase TEST/PROD.
- Ce staging ne restaure ni les tables métier, ni Auth, ni Storage, ni RLS, ni les calendriers externes et secrets. **NO-GO** jusqu'à restauration complète isolée et tests d'accès.
- Codespaces est un environnement temporaire : le dossier extrait et la base locale peuvent disparaître si le Codespace est supprimé. Conserver la sauvegarde Windows.
