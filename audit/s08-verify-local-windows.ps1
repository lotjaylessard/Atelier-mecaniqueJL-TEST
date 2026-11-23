# S08 — Vérification des fichiers physiques sur Windows (lecture seule)
# Exécuter : powershell -NoProfile -ExecutionPolicy Bypass -File .\audit\s08-verify-local-windows.ps1 -BackupFolder 'C:\S08-TEST\garage-s08-physical-...'
param([Parameter(Mandatory=$true)][string]$BackupFolder)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $BackupFolder).Path
$manifest = Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.format -ne 'atelier-test-physical-backup-v1' -or $manifest.source -ne 'Supabase TEST') { throw 'Format ou origine inattendu' }
if ($manifest.status -ne 'INCOMPLETE') { throw 'Ce contrôle est prévu pour export S08 partiel uniquement' }
if (@($manifest.failed).Count -ne 0 -or @($manifest.unresolvedReferences).Count -ne 0) { throw 'Manifest signale des erreurs' }
$items = @($manifest.files)
if ($items.Count -ne [int]$manifest.fileCount) { throw 'Nombre de fichiers incohérent' }
$sum = [long]0
foreach ($item in $items) {
  $name = [string]$item.path
  $parts = $name -split '/'
  if ($name -match '[\\:]' -or $name.StartsWith('/') -or @($parts | Where-Object { $_ -eq '..' -or $_ -eq '.' -or $_ -eq '' }).Count -gt 0) { throw "Chemin interdit : $name" }
  $full = Join-Path $root ('files\' + ($name -replace '/', '\'))
  $file = Get-Item -LiteralPath $full -ErrorAction Stop
  if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Lien symbolique interdit : $name" }
  if ($file.Length -ne [long]$item.bytes) { throw "Taille incorrecte : $name" }
  $hash = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne ([string]$item.sha256).ToLowerInvariant()) { throw "SHA-256 incorrect : $name" }
  $sum += $file.Length
  Write-Host "OK $name"
}
if ($sum -ne [long]$manifest.totalBytes) { throw 'Total octets incorrect' }
$data = Join-Path $root 'garage-data.json'
if ((Get-Item -LiteralPath $data).Length -ne [long]$manifest.snapshotBytes) { throw 'Taille JSON incorrecte' }
if ((Get-FileHash -LiteralPath $data -Algorithm SHA256).Hash.ToLowerInvariant() -ne ([string]$manifest.snapshotSha256).ToLowerInvariant()) { throw 'SHA-256 JSON incorrect' }
Write-Host "INTEGRITE_PARTIELLE_OK : $($items.Count) fichiers ; $sum octets. RESTAURATION NON AUTORISEE." -ForegroundColor Green
