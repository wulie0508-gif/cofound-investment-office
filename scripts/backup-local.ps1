$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$DataDirectory = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot "data"))
$BackupDirectory = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot "backups"))
if (-not $DataDirectory.StartsWith($ProjectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Data path escapes the project root."
}
if (-not (Test-Path -LiteralPath (Join-Path $DataDirectory "cofound-bp-desk.sqlite"))) {
  throw "No local database exists yet."
}

try {
  $Health = Invoke-RestMethod -Uri "http://127.0.0.1:4010/api/health" -TimeoutSec 2
  if ($Health.ok) {
    throw "Cofound BP Desk is running. Stop it before backup so SQLite and original files are captured consistently."
  }
} catch {
  if ($_.Exception.Message -like "Cofound BP Desk is running.*") { throw }
  # An unreachable loopback health endpoint means the service is stopped, as required.
}

New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Destination = Join-Path $BackupDirectory "cofound-bp-desk-$Timestamp.zip"
Compress-Archive -LiteralPath $DataDirectory -DestinationPath $Destination -CompressionLevel Optimal
Write-Host "Backup created: $Destination"
