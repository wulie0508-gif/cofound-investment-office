$ErrorActionPreference = "Stop"

$Startup = [System.IO.Path]::GetFullPath([Environment]::GetFolderPath("Startup"))
$ShortcutPath = [System.IO.Path]::GetFullPath(
  (Join-Path $Startup "Co-founder Investment Office Service.lnk")
)
$StartupPrefix = $Startup.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar

if (-not $ShortcutPath.StartsWith($StartupPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to change a shortcut outside the current user's Startup folder."
}

if (Test-Path -LiteralPath $ShortcutPath -PathType Leaf) {
  Remove-Item -LiteralPath $ShortcutPath -Force
  Write-Host "Current-user auto-start disabled." -ForegroundColor Green
} else {
  Write-Host "Current-user auto-start was already disabled."
}
