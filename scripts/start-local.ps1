param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$DataDirectory = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot "data"))
$PidFile = Join-Path $DataDirectory "server.pid"
$StdoutLog = Join-Path $DataDirectory "server.stdout.log"
$StderrLog = Join-Path $DataDirectory "server.stderr.log"
$HealthUrl = "http://127.0.0.1:4010/api/health"
$DashboardUrl = "http://127.0.0.1:4010"

if (-not $DataDirectory.StartsWith($ProjectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Data path escapes the project root."
}

Set-Location -LiteralPath $ProjectRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install Node.js 24 LTS or ask the project maintainer to prepare the machine."
}
if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
  throw "Corepack is required but was not found with Node.js."
}

try {
  $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
  if ($health.ok) {
    if (-not $NoBrowser) { Start-Process $DashboardUrl }
    Write-Host "Cofound BP Desk is already running."
    exit 0
  }
} catch {
  # A failed health check means the local service should be started.
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules"))) {
  Write-Host "Installing locked local dependencies for the first run..."
  & corepack pnpm@10.34.5 install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }
}

New-Item -ItemType Directory -Force -Path $DataDirectory | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $DataDirectory "cofound-bp-desk.sqlite"))) {
  Write-Host "Creating the local database and fictional demo projects..."
  & corepack pnpm@10.34.5 seed
  if ($LASTEXITCODE -ne 0) { throw "Local demo initialization failed." }
}

$BuildEntry = Join-Path $ProjectRoot "dist\index.js"
$RequiresBuild = -not (Test-Path -LiteralPath $BuildEntry -PathType Leaf)
if (-not $RequiresBuild) {
  $BuildTimestamp = (Get-Item -LiteralPath $BuildEntry).LastWriteTimeUtc
  $SourceDirectories = @("client", "server", "shared")
  foreach ($DirectoryName in $SourceDirectories) {
    $SourceDirectory = Join-Path $ProjectRoot $DirectoryName
    $NewerSource = Get-ChildItem -LiteralPath $SourceDirectory -Recurse -File | Where-Object {
      $_.Extension -in @(".ts", ".tsx", ".js", ".mjs", ".css", ".html") -and
      $_.LastWriteTimeUtc -gt $BuildTimestamp
    } | Select-Object -First 1
    if ($NewerSource) { $RequiresBuild = $true; break }
  }
  foreach ($ConfigName in @("package.json", "vite.config.ts", "tsconfig.json")) {
    $ConfigPath = Join-Path $ProjectRoot $ConfigName
    if ((Get-Item -LiteralPath $ConfigPath).LastWriteTimeUtc -gt $BuildTimestamp) {
      $RequiresBuild = $true
      break
    }
  }
}

if ($RequiresBuild) {
  Write-Host "Preparing the latest verified local workspace..."
  & corepack pnpm@10.34.5 build
  if ($LASTEXITCODE -ne 0) { throw "Local application build failed." }
}

if (-not (Test-Path -LiteralPath $BuildEntry -PathType Leaf)) {
  throw "Built local server is missing: $BuildEntry"
}
$NodeCommand = (Get-Command node).Source
$Process = Start-Process -FilePath $NodeCommand -ArgumentList @($BuildEntry) -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog
Set-Content -LiteralPath $PidFile -Value $Process.Id -Encoding ascii

$Ready = $false
for ($Attempt = 0; $Attempt -lt 80; $Attempt += 1) {
  Start-Sleep -Milliseconds 250
  try {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 1
    if ($health.ok) { $Ready = $true; break }
  } catch {
    if ($Process.HasExited) { break }
  }
}

if (-not $Ready) {
  Write-Host "Cofound BP Desk did not start. Review: $StderrLog" -ForegroundColor Red
  if (Test-Path -LiteralPath $StderrLog) { Get-Content -Tail 30 -LiteralPath $StderrLog }
  exit 1
}

if (-not $NoBrowser) { Start-Process $DashboardUrl }
Write-Host "Cofound BP Desk started at $DashboardUrl"
Write-Host "Original files remain local under $DataDirectory"
