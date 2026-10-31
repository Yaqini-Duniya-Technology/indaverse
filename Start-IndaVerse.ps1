$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$pythonExe = Join-Path $PSScriptRoot "apps/api/.venv/Scripts/python.exe"
$dockerExe = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"

foreach ($file in @($pythonExe, $dockerExe, ".env", "compose.yaml")) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Required file is missing: $file"
    }
}

$npmExe = (Get-Command npm.cmd -ErrorAction Stop).Source

Write-Host "`nStarting database services..." -ForegroundColor Cyan
& $dockerExe compose -p indaverse up -d --wait --wait-timeout 120
if ($LASTEXITCODE -ne 0) {
    throw "Database startup failed. Open Docker Desktop and try again."
}

Push-Location "apps/api"
try {
    & $pythonExe -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) {
        throw "Database migration failed."
    }
} finally {
    Pop-Location
}

function Get-ApiIdentity {
    try {
        return Invoke-RestMethod `
            -Uri "http://127.0.0.1:8002/openapi.json" `
            -TimeoutSec 2
    } catch {
        return $null
    }
}

$identity = Get-ApiIdentity

if ($identity) {
    if ($identity.info.title -ne "IndaVerse API") {
        throw "Port 8002 belongs to another API: $($identity.info.title)"
    }
} else {
    $listener = Get-NetTCPConnection `
        -LocalPort 8002 -State Listen -ErrorAction SilentlyContinue

    if ($listener) {
        throw "Port 8002 is occupied but IndaVerse is not responding."
    }

    $apiCommand = "& '$($pythonExe.Replace("'", "''"))' -m uvicorn app.main:app --host 127.0.0.1 --port 8002"
    $encoded = [Convert]::ToBase64String(
        [Text.Encoding]::Unicode.GetBytes($apiCommand)
    )

    Start-Process powershell.exe `
        -WorkingDirectory (Join-Path $PSScriptRoot "apps/api") `
        -ArgumentList @("-NoExit", "-EncodedCommand", $encoded)

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $identity = Get-ApiIdentity
        if ($identity) { break }
        Start-Sleep -Seconds 1
    }

    if (-not $identity -or $identity.info.title -ne "IndaVerse API") {
        throw "API startup failed. Check the new API terminal."
    }
}

Write-Host "IndaVerse API is ready on port 8002." -ForegroundColor Green

$webListener = Get-NetTCPConnection `
    -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue

if (-not $webListener) {
    $webCommand = "& '$($npmExe.Replace("'", "''"))' --prefix apps/web run dev -- --port 3000"
    $encoded = [Convert]::ToBase64String(
        [Text.Encoding]::Unicode.GetBytes($webCommand)
    )

    Start-Process powershell.exe `
        -WorkingDirectory $PSScriptRoot `
        -ArgumentList @("-NoExit", "-EncodedCommand", $encoded)
} else {
    Write-Host "A web server already uses port 3000; leaving it running."
}

$webReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $response = Invoke-WebRequest `
            -Uri "http://localhost:3000/login" `
            -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -eq 200) {
            $webReady = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}

if ($webReady) {
    Write-Host "`nOpen http://localhost:3000/dashboard" -ForegroundColor Green
    Write-Host "Keep the API and web terminals open."
} else {
    Write-Warning "Web server is still starting or needs attention. Check its terminal."
}
