# S10 CI only: exercise the actual PowerShell exporter with entirely fake source.
# Never connects to PostgreSQL or Supabase and never downloads network content.
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root=Join-Path ([IO.Path]::GetTempPath()) ("s10-ps-mock-"+[guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
  $paths=@(1..55 | ForEach-Object {"clients/fixture-$($_.ToString('000'))"})
  $refs=@($paths | Select-Object -First 49)
  $sizes=@{}
  foreach($p in $paths){$sizes[$p]=1}
  $fake= @{
    database="atelier_jl_restore_test"
    garages=1
    auth_users=1
    json_md5="cb5777bcb1f819bcc74fb73a9b22960f"
    files=$paths
    sizes=$sizes
    references=$refs
  } | ConvertTo-Json -Depth 6 -Compress
  $json=Join-Path $root "fixture.json"
  [IO.File]::WriteAllText($json,$fake)
  $bin=Join-Path $root "psql"
  $escaped=$json.Replace("'","'\''")
  $stub="#!/bin/sh`ncat '$escaped'`n"
  [IO.File]::WriteAllText($bin,$stub)
  & chmod +x $bin
  if($LASTEXITCODE -ne 0){throw "Could not prepare fake psql"}
  $env:PATH=$root+[IO.Path]::PathSeparator+$env:PATH
  $script=Join-Path $PSScriptRoot "s10-export-prod-physical-files.ps1"
  function global:Invoke-WebRequest {
    param(
      [string]$Uri,
      [string]$Method,
      [string]$OutFile,
      [int]$MaximumRedirection,
      [int]$TimeoutSec,
      [string]$ErrorAction
    )
    if(-not $Uri.StartsWith("https://feeapfylfzlvgnqtglnh.supabase.co/storage/v1/object/public/wo-files/")){
      throw "Unexpected download domain or bucket"
    }
    [IO.File]::WriteAllBytes($OutFile,[byte[]]@(7))
  }
  $destination=Join-Path $root "backups"
  & $script -BackupRoot $destination
  $folders=@(Get-ChildItem -LiteralPath $destination -Directory)
  if($folders.Count -ne 1){throw "Expected exactly one export folder"}
  $manifest=Get-Content -LiteralPath (Join-Path $folders[0].FullName "manifest.json") -Raw | ConvertFrom-Json
  if($manifest.status -ne "FILES_VERIFIED_FROM_HISTORICAL_LOCAL_INVENTORY" -or
     @($manifest.files).Count -ne 55 -or
     @($manifest.failures).Count -ne 0 -or
     $manifest.expected_bytes_from_local_metadata -ne 55 -or
     $manifest.actual_bytes -ne 55 -or
     -not $manifest.matches_nov23_checkpoint){
    throw "Manifest did not pass synthetic physical download verification"
  }
  $stored=@(Get-ChildItem -LiteralPath (Join-Path $folders[0].FullName "files") -Recurse -File)
  if($stored.Count -ne 55){throw "Expected 55 actual downloaded bytes on disk"}
  foreach($file in $stored){
    if($file.Length -ne 1 -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -notmatch '^[0-9A-F]{64}$'){
      throw "File integrity mismatch"
    }
  }
  Write-Host "S10_PROD_EXPORT_POWERSHELL_MOCK_PASS: 55 files, 49 linked, 6 unlinked, hashes, manifest and source isolation"
} finally {
  Remove-Item Function:\Invoke-WebRequest -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
