param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Find-CodexCli {
  $BinRoot = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin"
  if (Test-Path -LiteralPath $BinRoot -PathType Container) {
    $Candidate = Get-ChildItem -LiteralPath $BinRoot -Directory -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTimeUtc -Descending |
      ForEach-Object { Join-Path $_.FullName "codex.exe" } |
      Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
      Select-Object -First 1
    if ($Candidate) {
      return [System.IO.Path]::GetFullPath([string]$Candidate)
    }
  }

  $PathCommand = Get-Command codex.exe -ErrorAction SilentlyContinue
  if (-not $PathCommand) {
    $PathCommand = Get-Command codex -ErrorAction SilentlyContinue
  }
  if ($PathCommand -and $PathCommand.Source) {
    return [System.IO.Path]::GetFullPath([string]$PathCommand.Source)
  }

  throw "Codex is not installed. Install and sign in to the Codex desktop app, then run this installer again."
}

function Invoke-CodexJson {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  try {
    $Output = @(& $script:CodexCli @Arguments 2>&1)
  } catch {
    throw "Codex plugin command could not start: $($_.Exception.Message)"
  }
  if ($LASTEXITCODE -ne 0) {
    $Message = ($Output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    throw "Codex plugin command failed: $Message"
  }
  $Text = ($Output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }
  return $Text | ConvertFrom-Json
}

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$MarketplacePath = Join-Path $ProjectRoot ".agents\plugins\marketplace.json"
$PluginManifestPath = Join-Path $ProjectRoot "plugins\cofound-bp-desk\.codex-plugin\plugin.json"

foreach ($RequiredPath in @($MarketplacePath, $PluginManifestPath)) {
  if (-not (Test-Path -LiteralPath $RequiredPath -PathType Leaf)) {
    throw "The Cofound Codex plugin package is incomplete: $RequiredPath"
  }
}

$Marketplace = Get-Content -LiteralPath $MarketplacePath -Raw | ConvertFrom-Json
$Plugin = Get-Content -LiteralPath $PluginManifestPath -Raw | ConvertFrom-Json
$MarketplaceName = [string]$Marketplace.name
$PluginName = [string]$Plugin.name
$PluginVersion = [string]$Plugin.version

if ([string]::IsNullOrWhiteSpace($MarketplaceName) -or [string]::IsNullOrWhiteSpace($PluginName)) {
  throw "The Cofound Codex plugin metadata is invalid."
}

$script:CodexCli = Find-CodexCli
$MarketplaceList = Invoke-CodexJson -Arguments @("plugin", "marketplace", "list", "--json")
$ExistingMarketplace = @($MarketplaceList.marketplaces | Where-Object {
  [string]$_.name -eq $MarketplaceName
}) | Select-Object -First 1

if ($ExistingMarketplace) {
  $ExistingRoot = [System.IO.Path]::GetFullPath([string]$ExistingMarketplace.root).TrimEnd([char[]]@('\', '/'))
  $ExpectedRoot = $ProjectRoot.TrimEnd([char[]]@('\', '/'))
  if (-not $ExistingRoot.Equals($ExpectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "A Cofound plugin source with the same name already points to another folder. Remove the old Cofound installation before switching copies."
  }
} else {
  Invoke-CodexJson -Arguments @("plugin", "marketplace", "add", $ProjectRoot, "--json") | Out-Null
}

$PluginList = Invoke-CodexJson -Arguments @("plugin", "list", "--json")
$InstalledPlugin = @($PluginList.installed | Where-Object {
  [string]$_.name -eq $PluginName -and [string]$_.marketplaceName -eq $MarketplaceName
}) | Select-Object -First 1

$NeedsInstall = -not $InstalledPlugin -or
  [string]$InstalledPlugin.version -ne $PluginVersion -or
  -not [bool]$InstalledPlugin.enabled

if ($NeedsInstall) {
  Invoke-CodexJson -Arguments @("plugin", "add", "$PluginName@$MarketplaceName", "--json") | Out-Null
}

$VerifiedList = Invoke-CodexJson -Arguments @("plugin", "list", "--json")
$VerifiedPlugin = @($VerifiedList.installed | Where-Object {
  [string]$_.name -eq $PluginName -and
  [string]$_.marketplaceName -eq $MarketplaceName -and
  [string]$_.version -eq $PluginVersion -and
  [bool]$_.enabled
}) | Select-Object -First 1

if (-not $VerifiedPlugin) {
  throw "Cofound was not registered in Codex. Restart Codex and run the installer again."
}

if (-not $Quiet) {
  Write-Host "Cofound Codex plugin is ready." -ForegroundColor Green
  Write-Host "Plugin: $PluginName@$MarketplaceName"
  Write-Host "Version: $PluginVersion"
}
