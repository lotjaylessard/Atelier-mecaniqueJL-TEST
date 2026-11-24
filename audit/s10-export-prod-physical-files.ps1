# S10 — Backup original 55 public Storage objects to user's own computer.
# This script NEVER writes to Supabase and NEVER puts customer files on GitHub.
# Download the script from GitHub and run locally with PostgreSQL 17 + psql.
# Powershell: .\s10-export-prod-physical-files.ps1
[CmdletBinding()]
param(
  [string]$BackupRoot = (Join-Path $env:USERPROFILE "Documents\AtelierJL-Backup"),
  [string]$Database = "atelier_jl_restore_test",
  [string]$ExpectedJsonMd5 = "cb5777bcb1f819bcc74fb73a9b22960f"
)
$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest
$ProjectRef="feeapfylfzlvgnqtglnh"
$Bucket="wo-files"
if ($Database -ne "atelier_jl_restore_test") {
  throw "REFUSED: only the existing local restore atelier_jl_restore_test is allowed"
}
$psql=(Get-Command psql -ErrorAction SilentlyContinue)
if (-not $psql) { throw "psql is not installed or not in PATH" }
# Do not allow libpq environment overrides to silently redirect the connection.
$env:PGHOST="127.0.0.1"
$env:PGPORT="5432"
$env:PGDATABASE=$Database
$env:PGUSER="postgres"
# This query reads ONLY the user's LOCAL restored DB, never live SQL.
$query=@'
SELECT jsonb_build_object(
  'database',current_database(),
  'garages',(SELECT count(*) FROM public.garage_data),
  'auth_users',(SELECT count(*) FROM auth.users),
  'json_md5',(SELECT md5(data::text) FROM public.garage_data LIMIT 1),
  'files',(SELECT jsonb_agg(name ORDER BY name) FROM storage.objects
           WHERE bucket_id='wo-files'),
  'sizes',(SELECT jsonb_object_agg(name,(metadata->>'size')::bigint)
            FROM storage.objects WHERE bucket_id='wo-files'
              AND metadata->>'size' ~ '^[0-9]+
    SELECT COALESCE(jsonb_agg(DISTINCT attachment.value->>'path'),'[]'::jsonb)
    FROM public.garage_data gd
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(gd.data->'workorders')='array'
        THEN gd.data->'workorders' ELSE '[]'::jsonb END) wo(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(wo.value->'attachments')='array'
        THEN wo.value->'attachments' ELSE '[]'::jsonb END) attachment(value)
  )
)::text;
'@
$raw=@(& $psql.Source -X -h 127.0.0.1 -p 5432 -U postgres -d $Database -v ON_ERROR_STOP=1 -A -t -c $query)
if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL inventory query failed" }
$lines=@($raw | Where-Object { $_ -is [string] -and $_.TrimStart().StartsWith("{") })
if ($lines.Count -ne 1) { throw "Expected exactly one local inventory JSON result" }
$inventory=$lines[0] | ConvertFrom-Json
if ($inventory.database -ne $Database -or $inventory.garages -ne 1 -or $inventory.auth_users -ne 1) {
  throw "Unexpected local restore: expected one historical PROD garage and one Auth user"
}
$paths=@($inventory.files)
$refs=@($inventory.references)
if ($paths.Count -ne 55 -or $refs.Count -ne 49) {
  throw "Unexpected local counts: found $($paths.Count) files and $($refs.Count) references; revalidate a new snapshot first"
}
function Test-SafeObjectPath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Length -ge 2048) { return $false }
  if (-not $Value.StartsWith("clients/") -or $Value.Contains("\") -or $Value.Contains([char]0)) { return $false }
  foreach ($segment in $Value.Split('/')) {
    if (-not $segment -or $segment -eq "." -or $segment -eq ".." -or $segment.Length -gt 255) { return $false }
  }
  return $true
}
$distinct=[System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($item in $paths) {
  if (-not (Test-SafeObjectPath $item) -or -not $distinct.Add([string]$item)) {
    throw "Invalid or duplicated Storage path found in local metadata"
  }
}
foreach ($item in $refs) {
  if (-not $distinct.Contains([string]$item)) { throw "Missing legacy referenced object in local metadata" }
}
$stamp=(Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
$folder=Join-Path $BackupRoot "S10-PROD-files-$stamp"
$filesRoot=Join-Path $folder "files"
if (Test-Path -LiteralPath $folder) { throw "Refusing to overwrite previous backup" }
New-Item -ItemType Directory -Path $filesRoot -Force | Out-Null
$manifest=[ordered]@{
  source="original-Supabase-PROD-public-wo-files"
  project_ref=$ProjectRef
  bucket=$Bucket
  created_utc=(Get-Date).ToUniversalTime().ToString("o")
  status="INCOMPLETE"
  inventory_source="local-historical-PostgreSQL-restore"
  json_md5=$inventory.json_md5
  matches_nov23_checkpoint=($inventory.json_md5 -eq $ExpectedJsonMd5)
  expected_files=$paths.Count
  expected_linked=$refs.Count
  files=@()
  failures=@()
}
$manifestPath=Join-Path $folder "manifest.json"
function Save-Manifest {
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}
Save-Manifest
$index=0
foreach ($item in $paths) {
  $index++
  $local=Join-Path $filesRoot ($item.Replace('/',[IO.Path]::DirectorySeparatorChar))
  $localFull=[IO.Path]::GetFullPath($local)
  $rootFull=[IO.Path]::GetFullPath($filesRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
  if (-not $localFull.StartsWith($rootFull,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing destination outside backup root"
  }
  $parent=Split-Path -Parent $localFull
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $encoded=(@($item.Split('/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
  $url="https://$ProjectRef.supabase.co/storage/v1/object/public/$Bucket/$encoded"
  $part=$localFull+".partial"
  Write-Host "Downloading $index/$($paths.Count) from read-only public Storage"
  try {
    Invoke-WebRequest -Uri $url -Method Get -OutFile $part -MaximumRedirection 5 -TimeoutSec 90 -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $part)) { throw "Download returned no file" }
    Move-Item -LiteralPath $part -Destination $localFull -ErrorAction Stop
    $hash=(Get-FileHash -LiteralPath $localFull -Algorithm SHA256).Hash.ToLowerInvariant()
    $length=(Get-Item -LiteralPath $localFull).Length
    $expectedSize=$inventory.sizes.PSObject.Properties[$item].Value
    if ($null -eq $expectedSize -or $length -ne [long]$expectedSize) {
      throw "File size does not match locally restored Storage metadata"
    }
    $manifest.files+=@{path=$item;bytes=$length;sha256=$hash;referenced=($refs -contains $item)}
  } catch {
    $manifest.failures+=@{path=$item;message=$_.Exception.Message}
    Remove-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue
  }
  Save-Manifest
}
$done=@($manifest.files)
$linked=@($done | Where-Object { $_.referenced }).Count
$expectedTotal=@($inventory.sizes.PSObject.Properties | ForEach-Object {[long]$_.Value} | Measure-Object -Sum)[0].Sum
$actualTotal=@($done | ForEach-Object {[long]$_.bytes} | Measure-Object -Sum)[0].Sum
$manifest.expected_bytes_from_local_metadata=$expectedTotal
$manifest.actual_bytes=$actualTotal
if ($done.Count -eq 55 -and $linked -eq 49 -and $manifest.failures.Count -eq 0 -and $actualTotal -eq $expectedTotal) {
  $manifest.status="FILES_VERIFIED_FROM_HISTORICAL_LOCAL_INVENTORY"
} else {
  $manifest.status="INCOMPLETE"
}
$manifest.completed_utc=(Get-Date).ToUniversalTime().ToString("o")
Save-Manifest
if ($manifest.status -eq "INCOMPLETE") {
  throw "Incomplete export: inspect $manifestPath. Do not migrate based on these files."
}
Write-Host "Downloaded and SHA-256 hashed $($done.Count) physical files; $linked linked + $($done.Count-$linked) unlinked."
if (-not $manifest.matches_nov23_checkpoint) {
  Write-Warning "Local restored garage_data differs from the Nov 23 checkpoint; this is a HISTORICAL backup, not cutover proof."
}
Write-Warning "The actual live Supabase object inventory and binary content were not compared against a fresh server-side snapshot."
Write-Host "Backup folder: $folder"
),
  'references',(
    SELECT COALESCE(jsonb_agg(DISTINCT attachment.value->>'path'),'[]'::jsonb)
    FROM public.garage_data gd
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(gd.data->'workorders')='array'
        THEN gd.data->'workorders' ELSE '[]'::jsonb END) wo(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(wo.value->'attachments')='array'
        THEN wo.value->'attachments' ELSE '[]'::jsonb END) attachment(value)
  )
)::text;
'@
$raw=@(& $psql.Source -X -h 127.0.0.1 -p 5432 -U postgres -d $Database -v ON_ERROR_STOP=1 -A -t -c $query)
if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL inventory query failed" }
$lines=@($raw | Where-Object { $_ -is [string] -and $_.TrimStart().StartsWith("{") })
if ($lines.Count -ne 1) { throw "Expected exactly one local inventory JSON result" }
$inventory=$lines[0] | ConvertFrom-Json
if ($inventory.database -ne $Database -or $inventory.garages -ne 1 -or $inventory.auth_users -ne 1) {
  throw "Unexpected local restore: expected one historical PROD garage and one Auth user"
}
$paths=@($inventory.files)
$refs=@($inventory.references)
if ($paths.Count -ne 55 -or $refs.Count -ne 49) {
  throw "Unexpected local counts: found $($paths.Count) files and $($refs.Count) references; revalidate a new snapshot first"
}
function Test-SafeObjectPath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Length -ge 2048) { return $false }
  if (-not $Value.StartsWith("clients/") -or $Value.Contains("\") -or $Value.Contains([char]0)) { return $false }
  foreach ($segment in $Value.Split('/')) {
    if (-not $segment -or $segment -eq "." -or $segment -eq ".." -or $segment.Length -gt 255) { return $false }
  }
  return $true
}
$distinct=[System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($item in $paths) {
  if (-not (Test-SafeObjectPath $item) -or -not $distinct.Add([string]$item)) {
    throw "Invalid or duplicated Storage path found in local metadata"
  }
}
foreach ($item in $refs) {
  if (-not $distinct.Contains([string]$item)) { throw "Missing legacy referenced object in local metadata" }
}
$stamp=(Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
$folder=Join-Path $BackupRoot "S10-PROD-files-$stamp"
$filesRoot=Join-Path $folder "files"
if (Test-Path -LiteralPath $folder) { throw "Refusing to overwrite previous backup" }
New-Item -ItemType Directory -Path $filesRoot -Force | Out-Null
$manifest=[ordered]@{
  source="original-Supabase-PROD-public-wo-files"
  project_ref=$ProjectRef
  bucket=$Bucket
  created_utc=(Get-Date).ToUniversalTime().ToString("o")
  status="INCOMPLETE"
  inventory_source="local-historical-PostgreSQL-restore"
  json_md5=$inventory.json_md5
  matches_nov23_checkpoint=($inventory.json_md5 -eq $ExpectedJsonMd5)
  expected_files=$paths.Count
  expected_linked=$refs.Count
  files=@()
  failures=@()
}
$manifestPath=Join-Path $folder "manifest.json"
function Save-Manifest {
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}
Save-Manifest
$index=0
foreach ($item in $paths) {
  $index++
  $local=Join-Path $filesRoot ($item.Replace('/',[IO.Path]::DirectorySeparatorChar))
  $localFull=[IO.Path]::GetFullPath($local)
  $rootFull=[IO.Path]::GetFullPath($filesRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
  if (-not $localFull.StartsWith($rootFull,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing destination outside backup root"
  }
  $parent=Split-Path -Parent $localFull
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $encoded=(@($item.Split('/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
  $url="https://$ProjectRef.supabase.co/storage/v1/object/public/$Bucket/$encoded"
  $part=$localFull+".partial"
  Write-Host "Downloading $index/$($paths.Count) from read-only public Storage"
  try {
    Invoke-WebRequest -Uri $url -Method Get -OutFile $part -MaximumRedirection 0 -TimeoutSec 60 -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $part)) { throw "Download returned no file" }
    Move-Item -LiteralPath $part -Destination $localFull -ErrorAction Stop
    $hash=(Get-FileHash -LiteralPath $localFull -Algorithm SHA256).Hash.ToLowerInvariant()
    $length=(Get-Item -LiteralPath $localFull).Length
    $manifest.files+=@{path=$item;bytes=$length;sha256=$hash;referenced=($refs -contains $item)}
  } catch {
    $manifest.failures+=@{path=$item;message=$_.Exception.Message}
    Remove-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue
  }
  Save-Manifest
}
$done=@($manifest.files)
$linked=@($done | Where-Object { $_.referenced }).Count
if ($done.Count -eq 55 -and $linked -eq 49 -and $manifest.failures.Count -eq 0) {
  $manifest.status="FILES_VERIFIED_FROM_HISTORICAL_LOCAL_INVENTORY"
} else {
  $manifest.status="INCOMPLETE"
}
$manifest.completed_utc=(Get-Date).ToUniversalTime().ToString("o")
Save-Manifest
if ($manifest.status -eq "INCOMPLETE") {
  throw "Incomplete export: inspect $manifestPath. Do not migrate based on these files."
}
Write-Host "Downloaded and SHA-256 hashed $($done.Count) physical files; $linked linked + $($done.Count-$linked) unlinked."
if (-not $manifest.matches_nov23_checkpoint) {
  Write-Warning "Local restored garage_data differs from the Nov 23 checkpoint; this is a HISTORICAL backup, not cutover proof."
}
Write-Warning "The actual live Supabase object inventory and binary content were not compared against a fresh server-side snapshot."
Write-Host "Backup folder: $folder"
