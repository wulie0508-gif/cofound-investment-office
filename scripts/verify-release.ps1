param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Set-Location -LiteralPath $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install Node.js 24 LTS."
}
if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
  throw "Corepack is required but was not found with Node.js."
}

Write-Host "Checking Codex MCP server syntax..."
& node --check "plugins\cofound-bp-desk\scripts\mcp-server.mjs"
if ($LASTEXITCODE -ne 0) { throw "Codex MCP server syntax validation failed." }

Write-Host "Generating desktop and browser icons..."
& node "scripts\generate-app-icon.mjs"
if ($LASTEXITCODE -ne 0) { throw "Application icon generation failed." }

$Commands = [System.Collections.Generic.List[string[]]]::new()
if (-not $SkipInstall) {
  $Commands.Add([string[]]@("install", "--frozen-lockfile"))
}
$Commands.Add([string[]]@("skills:verify"))
$Commands.Add([string[]]@("check"))
$Commands.Add([string[]]@("test"))
$Commands.Add([string[]]@("build"))

$PreviousCI = $env:CI
$env:CI = "true"
try {
  foreach ($Arguments in $Commands) {
    Write-Host ("Running pnpm " + ($Arguments -join " ") + "...")
    & corepack pnpm@10.34.5 @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw ("Release verification failed: pnpm " + ($Arguments -join " "))
    }
  }
} finally {
  $env:CI = $PreviousCI
}

Write-Host "Release verification passed." -ForegroundColor Green
