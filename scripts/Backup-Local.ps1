param([string]$Destination = "")
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$dockerExe = "C:/Program Files/Docker/Docker/resources/bin/docker.exe"
if (-not $Destination) { $Destination = Join-Path (Get-Location) ("backups/" + (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + [guid]::NewGuid().ToString("N").Substring(0,8)) }
if (Test-Path -LiteralPath $Destination) { throw "Choose a new backup folder." }
New-Item -ItemType Directory -Path $Destination | Out-Null
$Destination = (Resolve-Path -LiteralPath $Destination).Path
& $dockerExe compose -p indaverse exec -T db pg_dump -U indaverse -d indaverse -Fc -f /tmp/indaverse-backup.dump
if ($LASTEXITCODE -ne 0) { throw "Database backup failed." }
& $dockerExe compose -p indaverse cp db:/tmp/indaverse-backup.dump (Join-Path $Destination "database.dump")
if ($LASTEXITCODE -ne 0) { throw "Backup copy failed." }
& $dockerExe compose -p indaverse exec -T db pg_restore --list /tmp/indaverse-backup.dump | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Database archive inspection failed." }
if (Test-Path "apps/api/uploads") { Copy-Item -LiteralPath "apps/api/uploads" -Destination (Join-Path $Destination "uploads") -Recurse }
Get-ChildItem -LiteralPath $Destination -Recurse -File | Get-FileHash -Algorithm SHA256 | Export-Csv -LiteralPath (Join-Path $Destination "checksums.csv") -NoTypeInformation
Write-Host "Backup saved to $Destination. This archive was inspected, not restore-tested. Keep it private."
