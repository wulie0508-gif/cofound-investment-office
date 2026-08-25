$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$PidFile = Join-Path $ProjectRoot "data\server.pid"
if (-not (Test-Path -LiteralPath $PidFile)) {
  Write-Host "No Cofound BP Desk PID file was found."
  exit 0
}

$ProcessId = [int](Get-Content -Raw -LiteralPath $PidFile)
$ProcessInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
if ($null -eq $ProcessInfo) {
  Remove-Item -LiteralPath $PidFile
  Write-Host "The recorded process is no longer running."
  exit 0
}

if (-not ($ProcessInfo.CommandLine -like "*$ProjectRoot*")) {
  throw "The recorded PID does not belong to this project; refusing to stop it."
}

Stop-Process -Id $ProcessId
Remove-Item -LiteralPath $PidFile
Write-Host "Cofound BP Desk stopped."
