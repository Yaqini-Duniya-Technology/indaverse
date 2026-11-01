param([switch]$Browser)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host "[1/4] Isolated API tests" -ForegroundColor Cyan
& "apps/api/.venv/Scripts/python.exe" scripts/test_api.py
if ($LASTEXITCODE -ne 0) { throw "API tests failed." }
Write-Host "[2/4] Web logic tests" -ForegroundColor Cyan
npm.cmd --prefix apps/web test
if ($LASTEXITCODE -ne 0) { throw "Web logic tests failed." }
Write-Host "[3/4] Production build (.next; development uses .next-dev)" -ForegroundColor Cyan
$production = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains((Join-Path (Get-Location).Path "apps\web")) -and
    ($_.CommandLine -match '\bnext[" ]*\s+start\b' -or $_.CommandLine -match '\.next[\\/]')
}
if ($production) { throw "Stop this project's production server before rebuilding. Other applications were left running." }
npm.cmd --prefix apps/web run build
if ($LASTEXITCODE -ne 0) { throw "Web build failed." }
Write-Host "[4/4] Repository checks" -ForegroundColor Cyan
git diff --check
if ($LASTEXITCODE -ne 0) { throw "Whitespace check failed." }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Staged whitespace check failed." }
if ($Browser) {
    $env:INDAVERSE_TEST_PYTHON = (Resolve-Path "apps/api/.venv/Scripts/python.exe").Path
    try {
        npm.cmd --prefix apps/web run test:browser
        if ($LASTEXITCODE -ne 0) { throw "Browser checks failed. Inspect apps/web/playwright-report." }
    } finally { Remove-Item Env:INDAVERSE_TEST_PYTHON -ErrorAction SilentlyContinue }
}
Write-Host "Release checks passed. Database/media backup remains separate. Browser checks run only with -Browser."
