param([Parameter(Mandatory=$true)][string]$BackupPath)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$dockerExe = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
if (-not $dockerExe) { $dockerExe = "C:/Program Files/Docker/Docker/resources/bin/docker.exe" }
& "apps/api/.venv/Scripts/python.exe" scripts/verify_backup.py $BackupPath --docker $dockerExe
if ($LASTEXITCODE -ne 0) { throw "Isolated restore verification failed. No live database was targeted." }
