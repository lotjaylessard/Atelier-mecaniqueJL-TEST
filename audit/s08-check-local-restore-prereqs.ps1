# S08 — Diagnostic lecture seule des prérequis de restauration locale.
# Ne lance aucun conteneur, n'installe rien et ne touche pas à Supabase.
$ErrorActionPreference = 'Continue'
Write-Host 'S08 - Diagnostic environnement local (lecture seule)' -ForegroundColor Cyan
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Host 'DOCKER_ABSENT : Docker Desktop non détecté dans PATH.' -ForegroundColor Yellow
    Write-Host 'Option recommandée : installer Docker Desktop après vérification des exigences Windows/WSL2.'
    exit 2
}
Write-Host ('Docker CLI : ' + $docker.Source)
& docker version --format '{{.Server.Version}}' 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
    Write-Host 'DOCKER_NON_PRET : moteur Docker inaccessible. Vérifier Docker Desktop.' -ForegroundColor Yellow
    exit 3
}
Write-Host 'DOCKER_PRET : moteur disponible pour un futur laboratoire isolé.' -ForegroundColor Green
Write-Host 'Aucun conteneur créé. Aucune restauration exécutée.'
