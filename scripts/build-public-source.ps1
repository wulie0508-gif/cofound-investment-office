param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$TargetRoot = [System.IO.Path]::GetFullPath($OutputDirectory)

if ($TargetRoot -eq $ProjectRoot -or $TargetRoot.StartsWith($ProjectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Public source target must be outside the private working repository."
}
if (Test-Path -LiteralPath $TargetRoot) {
  throw "Public source target already exists: $TargetRoot"
}

New-Item -ItemType Directory -Path $TargetRoot | Out-Null

function Copy-PublicFile {
  param([Parameter(Mandatory = $true)][string]$RelativePath)
  $SourcePath = Join-Path $ProjectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    throw "Required public source file is missing: $RelativePath"
  }
  $Item = Get-Item -LiteralPath $SourcePath -Force
  if ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    throw "Refusing to copy a reparse point: $RelativePath"
  }
  $DestinationPath = Join-Path $TargetRoot $RelativePath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $DestinationPath) | Out-Null
  Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath
}

function Copy-PublicTree {
  param(
    [Parameter(Mandatory = $true)][string]$RelativeRoot,
    [string[]]$ExcludedRelativePrefixes = @(),
    [string[]]$AllowedExtensions = @()
  )
  $SourceRoot = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $RelativeRoot))
  if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
    throw "Required public source directory is missing: $RelativeRoot"
  }
  Get-ChildItem -LiteralPath $SourceRoot -File -Recurse -Force | ForEach-Object {
    if ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
      throw "Refusing to copy a reparse point: $($_.FullName)"
    }
    $ChildRelative = $_.FullName.Substring($SourceRoot.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
    $RepoRelative = ($RelativeRoot.TrimEnd([char[]]@('\', '/')).Replace('\', '/') + "/" + $ChildRelative)
    foreach ($Prefix in $ExcludedRelativePrefixes) {
      if ($RepoRelative.StartsWith($Prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        return
      }
    }
    if ($AllowedExtensions.Count -gt 0 -and $AllowedExtensions -notcontains $_.Extension.ToLowerInvariant()) {
      return
    }
    Copy-PublicFile -RelativePath $RepoRelative
  }
}

$RootFiles = @(
  ".dockerignore",
  ".env.example",
  ".gitignore",
  ".prettierignore",
  ".prettierrc",
  "Backup-Cofound-BP-Desk.cmd",
  "CHANGELOG.md",
  "components.json",
  "CONTRIBUTING.md",
  "Disable-Cofound-Autostart.cmd",
  "docker-compose.yml",
  "Dockerfile",
  "Install-Cofound-Desktop-Shortcut.cmd",
  "LEADER_START_HERE.md",
  "LICENSE",
  "NOTICE",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "README.md",
  "SECURITY.md",
  "Start-Cofound-BP-Desk.cmd",
  "Stop-Cofound-BP-Desk.cmd",
  "THIRD_PARTY_NOTICES.md",
  "tsconfig.json",
  "vercel.json",
  "vite.config.ts",
  "vitest.config.ts"
)

$RootFiles | ForEach-Object { Copy-PublicFile $_ }

Copy-PublicFile ".agents/plugins/marketplace.json"
Copy-PublicTree ".github"
Copy-PublicTree "api"
Copy-PublicTree "client" -ExcludedRelativePrefixes @(
  "client/public/",
  "client/src/_core/",
  "client/src/const.ts",
  "client/src/components/AIChatBox.tsx",
  "client/src/components/DashboardLayout.tsx",
  "client/src/components/DashboardLayoutSkeleton.tsx",
  "client/src/components/ManusDialog.tsx",
  "client/src/components/Map.tsx",
  "client/src/pages/ComponentShowcase.tsx",
  "client/src/pages/Home.tsx",
  "client/src/pages/ProjectEdit.tsx"
)
Copy-PublicTree "integrations"
Copy-PublicTree "plugins"
Copy-PublicTree "samples" -AllowedExtensions @(".md", ".json")

$PublicScripts = @(
  "scripts/backup-local.ps1",
  "scripts/browser-verify.ts",
  "scripts/build-public-source.ps1",
  "scripts/disable-autostart.ps1",
  "scripts/generate-app-icon.mjs",
  "scripts/generate-test-bps.py",
  "scripts/import-test-portfolio.ts",
  "scripts/install-codex-plugin.ps1",
  "scripts/install-desktop-shortcut.ps1",
  "scripts/lite-browser-verify.ts",
  "scripts/migrate-vercel-lite.ts",
  "scripts/ocr-smoke.ts",
  "scripts/open-dashboard.ps1",
  "scripts/publish-test-portfolio.ts",
  "scripts/seed-demo.ts",
  "scripts/smoke-test.ts",
  "scripts/start-codex.ps1",
  "scripts/start-local.ps1",
  "scripts/stop-local.ps1",
  "scripts/ui-verify.ts",
  "scripts/verify-cofound-skills.ts",
  "scripts/verify-release.ps1"
)
$PublicScripts | ForEach-Object { Copy-PublicFile $_ }

Copy-PublicTree "server/collaboration"
Copy-PublicTree "server/local"
Copy-PublicFile "server/_core/index.ts"
Copy-PublicFile "server/_core/vite.ts"
Copy-PublicFile "server/routers.ts"

$SharedFiles = @(
  "shared/bp.ts",
  "shared/collaboration.ts",
  "shared/feishu-feedback.ts",
  "shared/feishu-sync.ts",
  "shared/field-metadata.ts",
  "shared/iteration.ts",
  "shared/operation-ledger.ts",
  "shared/product-feedback.ts"
)
$SharedFiles | ForEach-Object { Copy-PublicFile $_ }

Copy-PublicTree "vercel"

$PublicDocs = @(
  "docs/ARCHITECTURE.md",
  "docs/CLEANTECH_INTEGRATION.md",
  "docs/FEISHU_INTERNAL_STORAGE.md",
  "docs/FEISHU_PRODUCT_FEEDBACK.md",
  "docs/PRIVACY.md",
  "docs/PRODUCT_FEEDBACK_AND_MAINTENANCE.md",
  "docs/SECURITY_AND_DEPLOYMENT.md"
)
$PublicDocs | ForEach-Object { Copy-PublicFile $_ }

$PublicPackagePath = Join-Path $TargetRoot "package.json"
$PublicPackage = Get-Content -LiteralPath $PublicPackagePath -Raw | ConvertFrom-Json
foreach ($ScriptName in @("delivery:verify", "delivery:verify:full", "handoff:build")) {
  $PublicPackage.scripts.PSObject.Properties.Remove($ScriptName)
}
$Utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
  $PublicPackagePath,
  (($PublicPackage | ConvertTo-Json -Depth 20) + [Environment]::NewLine),
  $Utf8WithoutBom
)

New-Item -ItemType Directory -Force -Path (Join-Path $TargetRoot "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $TargetRoot "backups") | Out-Null
Copy-PublicFile "data/.gitkeep"
Copy-PublicFile "backups/.gitkeep"

$Package = Get-Content -LiteralPath (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
$Plugin = Get-Content -LiteralPath (Join-Path $ProjectRoot "plugins/cofound-bp-desk/.codex-plugin/plugin.json") -Raw | ConvertFrom-Json
$Manifest = [ordered]@{
  product = "Cofound Investment Office"
  appVersion = [string]$Package.version
  pluginVersion = [string]$Plugin.version
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  sourceMode = "strict-allowlist-fresh-history"
  includes = @("application-source", "codex-plugin", "public-contracts", "synthetic-samples", "public-docs")
  excludes = @("git-history", "local-data", "real-bp", "credentials", "feishu-locators", "vercel-binding", "internal-reports", "artifacts")
}
[System.IO.File]::WriteAllText(
  (Join-Path $TargetRoot "PUBLIC-SOURCE-MANIFEST.json"),
  (($Manifest | ConvertTo-Json -Depth 4) + [Environment]::NewLine),
  $Utf8WithoutBom
)

Write-Host "Public source snapshot created: $TargetRoot" -ForegroundColor Green
