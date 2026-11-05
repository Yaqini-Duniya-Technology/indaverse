param([ValidateSet("api", "web", "all")][string]$Service = "all")
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$services = if ($Service -eq "all") { @("api", "web") } else { @($Service) }
foreach ($name in $services) {
    $file = Join-Path $PSScriptRoot ".local-run/$name.json"
    if (-not (Test-Path -LiteralPath $file)) { Write-Host "$name has no managed process record. Stop its original terminal manually if needed."; continue }
    $record = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.pid)" -ErrorAction SilentlyContinue
    if (-not $process) { Write-Host "$name is no longer running."; continue }
    $started = [DateTimeOffset]::FromUnixTimeSeconds([long]$record.started_at)
    if (-not $process.CommandLine -or $process.CommandLine.IndexOf($PSScriptRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
        [Math]::Abs((([DateTimeOffset]$process.CreationDate) - $started).TotalSeconds) -gt 15) {
        throw "Managed $name PID identity changed. No process was stopped; inspect it manually."
    }
    & "$env:SystemRoot/System32/taskkill.exe" /PID $record.pid /T /F
    if ($LASTEXITCODE -ne 0) { throw "Could not stop managed $name process tree." }
    Remove-Item -LiteralPath $file
}
Write-Host "Database containers were left running. No project or uploaded file was removed."
