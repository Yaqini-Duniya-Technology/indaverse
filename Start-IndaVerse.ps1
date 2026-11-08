param([ValidateSet("development", "production")][string]$WebMode = "development")
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$pythonExe = Join-Path $PSScriptRoot "apps/api/.venv/Scripts/python.exe"
if (-not (Test-Path -LiteralPath $pythonExe)) { throw "Run scripts/Setup-Local.ps1 to create the API environment." }
& $pythonExe scripts/check_local.py
if ($LASTEXITCODE -ne 0) { throw "Preflight failed. Correct the named configuration/dependency issues; secrets were not printed." }
$dockerExe = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
if (-not $dockerExe) { $dockerExe = "C:/Program Files/Docker/Docker/resources/bin/docker.exe" }
if (-not (Test-Path -LiteralPath $dockerExe)) { throw "Docker Desktop CLI was not found." }
Write-Host "Starting database services..." -ForegroundColor Cyan
& $dockerExe compose -p indaverse up -d --wait --wait-timeout 120
if ($LASTEXITCODE -ne 0) { throw "Database services failed. Check Docker Desktop; no database was reset." }
Push-Location "apps/api"
try {
    & $pythonExe -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "Database migration failed. Stop here and inspect the output." }
} finally { Pop-Location }
& $pythonExe scripts/local_services.py api
if ($LASTEXITCODE -ne 0) { throw "API startup failed. Diagnostic log: .local-run/api.log. Do not share logs without checking for private values." }
& $pythonExe scripts/local_services.py web --mode $WebMode
if ($LASTEXITCODE -ne 0) { throw "Web startup failed. Diagnostic log: .local-run/web.log." }
Write-Host "Open http://localhost:3000/dashboard or /status. Services run independently of this terminal." -ForegroundColor Green
