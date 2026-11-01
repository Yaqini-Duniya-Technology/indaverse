$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path "apps/api/.venv/Scripts/python.exe")) {
    python -m venv apps/api/.venv
    if ($LASTEXITCODE -ne 0) { throw "Python environment creation failed." }
}
$pythonExe = Join-Path (Get-Location) "apps/api/.venv/Scripts/python.exe"
& $pythonExe -m pip install -r apps/api/requirements.txt
if ($LASTEXITCODE -ne 0) { throw "API dependencies failed." }
npm.cmd --prefix apps/web ci
if ($LASTEXITCODE -ne 0) { throw "Web dependencies failed." }
& $pythonExe -c "import secrets; from pathlib import Path; p=Path('.env'); template=Path('.env.example').read_text(encoding='utf-8-sig'); password=secrets.token_hex(24); template=template.replace('REPLACE_WITH_RANDOM_HEX',password).replace('REPLACE_WITH_RANDOM_SECRET',secrets.token_urlsafe(48)); p.write_text(template,encoding='utf-8') if not p.exists() else None; web=Path('apps/web/.env.local'); web.write_text('NEXT_PUBLIC_API_URL=http://localhost:8002\n',encoding='utf-8') if not web.exists() else None"
if ($LASTEXITCODE -ne 0) { throw "Configuration creation failed." }
Write-Host "Setup complete. Existing configuration was preserved. Start Docker Desktop, then run Start-IndaVerse.ps1."
