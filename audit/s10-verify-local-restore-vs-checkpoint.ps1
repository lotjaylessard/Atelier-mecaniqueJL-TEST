# S10 — Compare archived local restore against one exact live checkpoint.
# READ ONLY. Never connects to Supabase PROD or TEST; never restores/imports.
# Run in PowerShell: .\audit\s10-verify-local-restore-vs-checkpoint.ps1
[CmdletBinding()]
param(
 [string]$Database = 'atelier_jl_restore_test',
 [string]$ExpectedMd5 = 'cb5777bcb1f819bcc74fb73a9b22960f',
 [int]$ExpectedClients = 42,
 [int]$ExpectedWorkorders = 88,
 [int]$ExpectedInvoices = 87,
 [int]$ExpectedFiles = 55
)
$ErrorActionPreference = 'Stop'
if ($Database -ne 'atelier_jl_restore_test') { throw 'REFUSED: only atelier_jl_restore_test is accepted.' }
$scriptPath = Join-Path $PSScriptRoot 's10-local-restore-business-integrity-READ-ONLY.psql'
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Missing read-only SQL: $scriptPath" }
$exe = Get-Command 'psql' -ErrorAction SilentlyContinue
if (-not $exe) { throw 'psql not in PATH. This script requires the local PostgreSQL client already used for the PowerShell restore.' }
# Force localhost and the named local restore. Never accept a Supabase endpoint.
$output = & $exe.Source -X -h 127.0.0.1 -p 5432 -U postgres -d $Database -v ON_ERROR_STOP=1 -A -t -f $scriptPath 2>&1
if ($LASTEXITCODE -ne 0) { throw ('Read-only check failed: ' + ($output | Out-String)) }
$jsonLine = @($output | Where-Object { $_ -is [string] -and $_.TrimStart().StartsWith('{') })
if ($jsonLine.Count -ne 1) { throw ('Expected one JSON integrity report, got ' + $jsonLine.Count) }
$state = $jsonLine[0] | ConvertFrom-Json
$checks = [ordered]@{
 database_is_local = ($state.local_database -eq $Database)
 single_owner_data = ($state.garage_data_rows -eq 1 -and $state.valid_owner_auth_rows -eq 1)
 clients_match = ($state.clients -eq $ExpectedClients)
 workorders_match = ($state.workorders -eq $ExpectedWorkorders)
 invoices_match = ($state.invoices -eq $ExpectedInvoices)
 json_snapshot_match = ($state.source_json_hash -eq $ExpectedMd5)
 storage_metadata_match = ($state.storage_metadata -eq $ExpectedFiles)
 linked_files_resolved = ($state.missing_attached_objects -eq 0)
}
$report = [ordered]@{
 status = $(if (@($checks.Values | Where-Object { $_ -eq $false }).Count -eq 0) { 'MATCHES_NOV_23_CHECKPOINT' } else { 'DIFFERENT_OR_INCOMPLETE_RESTORE' })
 checks = $checks
 local = $state
 notice = 'Only compares restored DB rows and Storage metadata. Does NOT validate physical file bytes, login, RLS or a fresh cutover backup.'
}
$report | ConvertTo-Json -Depth 5
if ($report.status -ne 'MATCHES_NOV_23_CHECKPOINT') { exit 2 }
