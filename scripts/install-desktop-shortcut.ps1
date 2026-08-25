$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$Launcher = Join-Path $ProjectRoot "scripts\open-dashboard.ps1"
$Icon = Join-Path $ProjectRoot "client\src\assets\cofound-investment-office.ico"
$IconGenerator = Join-Path $ProjectRoot "scripts\generate-app-icon.mjs"
$Desktop = [Environment]::GetFolderPath("Desktop")
$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Desktop "Co-founder Investment Office.lnk"
$StartupShortcutPath = Join-Path $Startup "Co-founder Investment Office Service.lnk"
$StartScript = Join-Path $ProjectRoot "scripts\start-local.ps1"
$PluginInstaller = Join-Path $ProjectRoot "scripts\install-codex-plugin.ps1"

if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) {
  throw "Dashboard launcher is missing: $Launcher"
}
if (-not (Test-Path -LiteralPath $PluginInstaller -PathType Leaf)) {
  throw "Codex plugin installer is missing: $PluginInstaller"
}
if (-not (Test-Path -LiteralPath $Icon -PathType Leaf)) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required to generate the application icon."
  }
  & node $IconGenerator
  if ($LASTEXITCODE -ne 0) { throw "Application icon generation failed." }
}

& $PluginInstaller

$PowerShell = (Get-Command powershell.exe).Source
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $PowerShell
$Shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $Launcher + '"'
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.IconLocation = "$Icon,0"
$Shortcut.Description = "Co-founder Investment Office｜本地早期投资项目工作台"
$Shortcut.WindowStyle = 7
$Shortcut.Save()

$StartupShortcut = $Shell.CreateShortcut($StartupShortcutPath)
$StartupShortcut.TargetPath = $PowerShell
$StartupShortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $StartScript + '" -NoBrowser'
$StartupShortcut.WorkingDirectory = $ProjectRoot
$StartupShortcut.IconLocation = "$Icon,0"
$StartupShortcut.Description = "Co-founder Investment Office｜登录后启动本地服务"
$StartupShortcut.WindowStyle = 7
$StartupShortcut.Save()

Write-Host "Desktop shortcut, current-user auto-start, and Cofound Codex plugin installed." -ForegroundColor Green
Write-Host "Desktop: $ShortcutPath"
Write-Host "Auto-start: $StartupShortcutPath"
