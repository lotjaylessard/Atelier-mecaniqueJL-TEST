# S10: continue existing LOCAL RESTORE with phases 5-10 on a disposable COPY.
# Does not rerun phases 1-4, backup, or change either real Supabase project.
# Does not touch original local restore or previously downloaded 55 binary files.
[CmdletBinding()]
param(
 [string]$BackupRoot = (Join-Path $env:USERPROFILE 'Documents\AtelierJL-Backup')
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$sourceDb='atelier_jl_restore_test'
$cloneDb='atelier_jl_s10_continuation'
$psql=Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) { throw 'psql not found; use the PostgreSQL 17 client used for the existing local restore' }
function Invoke-LocalQuery([string]$db,[string]$sql) {
 $output=@(& $psql.Source -X -h 127.0.0.1 -p 5432 -U postgres -d $db -v ON_ERROR_STOP=1 -Atc $sql 2>&1)
 if($LASTEXITCODE -ne 0) { throw ("Local SQL refused or failed: " + ($output | Out-String)) }
 return ($output -join "`n").Trim()
}
# Refuse accidental wrong cluster/project even if a network override is configured.
$endpoint=Invoke-LocalQuery 'postgres' "SELECT current_setting('port') || '|' || host(inet_server_addr())"
if($endpoint -ne '5432|127.0.0.1') {
 throw "REFUSED: unexpected PostgreSQL endpoint $endpoint"
}
$check=@'
SELECT CASE WHEN current_database()='atelier_jl_restore_test'
 AND (SELECT count(*) FROM public.garage_data)=1
 AND (SELECT count(*) FROM auth.users)=1
 AND (SELECT count(*) FROM public.garage_members WHERE role='owner')=1
 AND (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')=55
 AND to_regclass('public.garage_quotes') IS NOT NULL
 AND to_regclass('public.garage_external_calendar_connections') IS NOT NULL
 AND to_regprocedure('public.s06_timer_transition(uuid,text,bigint,text)') IS NULL
 THEN 'PHASE1_TO4_PRESENT' ELSE 'REFUSED' END;
'@
$preflight=Invoke-LocalQuery $sourceDb $check
if($preflight -ne 'PHASE1_TO4_PRESENT') { throw "Refused: original local restore is not exactly at phases 1-4" }
$existing=Invoke-LocalQuery 'postgres' "SELECT count(*) FROM pg_database WHERE datname='atelier_jl_s10_continuation'"
if($existing -notin @('0','1')) { throw 'REFUSED: unexpected clone count' }
$originalHash=Invoke-LocalQuery $sourceDb 'SELECT md5(data::text) FROM public.garage_data'
$resumePolicies = 'NONE'
if($existing -eq '1') {
  # Resume the already-created LOCAL clone with three inherited policies or
  # with the full five policies installed by the previous successful shim run.
  # Any partially applied later phase, unexpected policy or altered data = STOP.
  $cloneState=Invoke-LocalQuery $cloneDb @'
SELECT CASE WHEN current_database()='atelier_jl_s10_continuation'
 AND (SELECT count(*) FROM public.garage_data)=1
 AND (SELECT count(*) FROM auth.users)=1
 AND (SELECT count(*) FROM public.garage_members WHERE role='owner')=1
 AND (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')=55
 AND to_regclass('public.garage_quotes') IS NOT NULL
 AND to_regclass('public.garage_external_calendar_connections') IS NOT NULL
 AND to_regprocedure('public.s06_timer_transition(uuid,text,bigint,text)') IS NULL
 AND (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename='garage_data') IN (3,5)
 AND (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename='garage_data'
      AND policyname IN ('Users can insert their own data',
        'Users can read their own data','Users can update their own data')
      AND roles='{public}' AND permissive='PERMISSIVE'
      AND ((policyname='Users can insert their own data' AND cmd='INSERT')
        OR (policyname='Users can read their own data' AND cmd='SELECT')
        OR (policyname='Users can update their own data' AND cmd='UPDATE')))=3
 AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='garage_data' AND policyname NOT IN
       ('Users can insert their own data','Users can read their own data',
        'Users can update their own data','Allow authenticated users','Deny anon'))
 AND (SELECT count(*) FROM pg_policies WHERE schemaname='public'
       AND tablename='garage_data' AND policyname IN
       ('Allow authenticated users','Deny anon')) IN (0,2)
 AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='garage_data' AND policyname IN
       ('Allow authenticated users','Deny anon') AND
       NOT ((policyname='Allow authenticated users' AND cmd='ALL'
             AND roles='{authenticated}') OR
            (policyname='Deny anon' AND cmd='ALL' AND roles='{anon}')))
 THEN md5((SELECT data::text FROM public.garage_data)) || '|' ||
      (SELECT count(*)::text FROM pg_policies WHERE schemaname='public'
         AND tablename='garage_data')
 ELSE 'REFUSED' END;
'@
  $parts=$cloneState -split '\\|'
  if($parts.Count -ne 2 -or $parts[0] -ne $originalHash -or
     $parts[1] -notin @('3','5')) {
    throw 'REFUSED: existing local clone is not in an approved pre-migration state; not overwriting'
  }
  $resumePolicies=$parts[1]
  Write-Host ("Resuming existing LOCAL clone with "+$resumePolicies+" inherited policies; no database replaced.")
}
if($originalHash -notmatch '^[0-9a-f]{32}$') { throw 'Could not capture source business hash' }
# Fetch only schema/script sources, never client data or Storage.
$commit='19353285eae8222f95e8e6ccedf0bfcd1fb331ef'
$baseUrl="https://raw.githubusercontent.com/lotjaylessard/Atelier-mecaniqueJL-TEST/$commit/audit"
$runFolder=Join-Path $BackupRoot ('S10-local-continuation-'+(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))
if(Test-Path -LiteralPath $runFolder){throw 'Refusing to overwrite an existing work folder'}
New-Item -ItemType Directory -Path $runFolder -Force | Out-Null
$candidateFile=Join-Path $runFolder 's10-original-candidate-NOT-EXECUTED.sql'
$shimsFile=Join-Path $runFolder 's10-local-clone-supabase-shims.sql'
$phaseFile=Join-Path $runFolder 's10-phase5-to10-LOCAL-ONLY.sql'
Invoke-WebRequest -Uri "$baseUrl/s10-prod-complete-migration-candidate-NOT-EXECUTED.sql" -OutFile $candidateFile
Invoke-WebRequest -Uri "$baseUrl/s10-local-clone-supabase-shims.sql" -OutFile $shimsFile
$candidate=[IO.File]::ReadAllText($candidateFile)
$marker='-- ===== s10-phase5-supabase-helper-timer-functions.sql ====='
$idx=$candidate.IndexOf($marker,[StringComparison]::Ordinal)
if($idx -lt 0 -or $candidate.IndexOf($marker,$idx+1,[StringComparison]::Ordinal) -ge 0) {
 throw 'Candidate SQL has a missing or ambiguous phase boundary'
}
$remainder=$candidate.Substring($idx).Trim()
if(-not $remainder.EndsWith('COMMIT;') -or
  -not $remainder.Contains('Garage members read active garage data') -or
  -not $remainder.Contains('s10_finalize_bt_invoice_owner_candidate') -or
  -not $remainder.Contains('REVOKE ALL ON TABLE public.garage_data')) {
 throw 'Refused: unexpected SQL candidate layout'
}
$guard=@'
\set ON_ERROR_STOP on
BEGIN;
DO $s10_local_clone_guard$
BEGIN
 IF current_database()<>'atelier_jl_s10_continuation' OR
    (inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN (inet '127.0.0.1', inet '::1')) OR
    (SELECT count(*) FROM public.garage_data)<>1 OR
    (SELECT count(*) FROM auth.users)<>1 OR
    (SELECT count(*) FROM public.garage_members WHERE role='owner')<>1 OR
    (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')<>55 OR
    to_regclass('public.garage_quotes') IS NULL OR
    to_regclass('public.garage_external_calendar_connections') IS NULL OR
    to_regprocedure('public.s06_timer_transition(uuid,text,bigint,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'REFUSED: requires untouched local clone after phases 1-4'; END IF;
END $s10_local_clone_guard$;

'@
[IO.File]::WriteAllText($phaseFile,$guard+$remainder+"`n")
# Non-destructive copy using PostgreSQL's native database TEMPLATE.
# Will fail safely if the source DB has active connections. No forced termination.
if($existing -eq '0') {
  $created=Invoke-LocalQuery 'postgres' "CREATE DATABASE atelier_jl_s10_continuation TEMPLATE atelier_jl_restore_test"
}
function Invoke-LocalScript([string]$sqlPath){
 # Windows PowerShell 5.1 treats PostgreSQL NOTICE on stderr as a terminating
 # NativeCommandError if ErrorActionPreference=Stop. Only the process exit code
 # indicates actual SQL success/failure. Capture streams separately.
 $step=[IO.Path]::GetFileNameWithoutExtension($sqlPath)
 $outLog=Join-Path $runFolder ($step+'.stdout.log')
 $errLog=Join-Path $runFolder ($step+'.stderr.log')
 $args=@('-X','-h','127.0.0.1','-p','5432','-U','postgres','-d',$cloneDb,
   '-v','ON_ERROR_STOP=1','-f',('"' + $sqlPath + '"'))
 $proc=Start-Process -FilePath $psql.Source -ArgumentList $args -Wait -PassThru -NoNewWindow -RedirectStandardOutput $outLog -RedirectStandardError $errLog
 $details=if(Test-Path -LiteralPath $errLog){Get-Content -LiteralPath $errLog -Raw}else{''}
 if($proc.ExitCode -ne 0) {
   throw ("Local SQL phase failed (exit "+$proc.ExitCode+"); original restore untouched. Details: "+$details)
 }
 Write-Host ("LOCAL_SQL_OK: "+$step+"; exit="+$proc.ExitCode)
 if($details -and $details -match 'NOTICE:') {
   Write-Host "PostgreSQL informational NOTICE messages saved to local log."
 }
}
if($resumePolicies -ne '5') {
  Invoke-LocalScript $shimsFile
} else {
  Write-Host 'LOCAL_SHIMS_ALREADY_APPLIED: skipping duplicate legacy-policy changes.'
}
Invoke-LocalScript $phaseFile
$afterHash=Invoke-LocalQuery $cloneDb 'SELECT md5(data::text) FROM public.garage_data'
$originalAfterHash=Invoke-LocalQuery $sourceDb 'SELECT md5(data::text) FROM public.garage_data'
if($afterHash -ne $originalHash -or $originalAfterHash -ne $originalHash) {
 throw 'FAIL: original and cloned business data hashes differ'
}
$post=@'
SELECT CASE WHEN
 (SELECT count(*) FROM public.garage_data)=1
 AND (SELECT count(*) FROM public.garages)=1
 AND (SELECT count(*) FROM public.garage_members WHERE role='owner')=1
 AND (SELECT count(*) FROM storage.objects WHERE bucket_id='wo-files')=55
 AND (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='garage_data')=2
 AND to_regprocedure('public.s06_timer_transition(uuid,text,bigint,text)') IS NOT NULL
 AND to_regprocedure('public.s08_convert_quote_to_workorder(uuid,bigint,bigint,boolean)') IS NOT NULL
 THEN 'LOCAL_CONTINUATION_PASS' ELSE 'LOCAL_CONTINUATION_FAIL' END;
'@
$status=Invoke-LocalQuery $cloneDb $post
if($status -ne 'LOCAL_CONTINUATION_PASS'){throw "Postcondition failed: $status"}
$report=[ordered]@{
 status=$status
 original_database=$sourceDb
 disposable_clone=$cloneDb
 original_business_hash=$originalHash
 clone_business_hash=$afterHash
 files_metadata=55
 physical_files_in_existing_backup='NOT RE-COPIED; verify separately'
 supabase_auth_and_edge_functions='NOT TESTED'
}
$reportPath=Join-Path $runFolder 'report.json'
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8
$report | ConvertTo-Json -Depth 5
Write-Host "Report saved locally: $reportPath"
