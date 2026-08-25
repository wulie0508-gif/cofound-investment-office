param(
  [switch]$DetectOnly
)

$ErrorActionPreference = "Stop"

function Find-CodexDesktopApp {
  $StartApp = Get-StartApps | Where-Object {
    $_.AppID -like "OpenAI.Codex_*!App" -or
    $_.Name -match "^(Codex|ChatGPT)$"
  } | Select-Object -First 1

  if ($StartApp) {
    return [pscustomobject]@{
      Kind = "windows_app"
      Name = [string]$StartApp.Name
      Target = [string]$StartApp.AppID
    }
  }

  $Candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Codex\ChatGPT.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\ChatGPT\ChatGPT.exe"),
    (Join-Path $env:LOCALAPPDATA "OpenAI\Codex\ChatGPT.exe"),
    (Join-Path $env:ProgramFiles "OpenAI\ChatGPT.exe")
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }

  if ($Candidates.Count -gt 0) {
    return [pscustomobject]@{
      Kind = "executable"
      Name = "Codex"
      Target = [System.IO.Path]::GetFullPath($Candidates[0])
    }
  }

  return $null
}

$App = Find-CodexDesktopApp
if (-not $App) {
  throw "Codex desktop app was not found. Install and sign in to the OpenAI Codex/ChatGPT Windows app first."
}

if ($DetectOnly) {
  $App
  return
}

if ($App.Kind -eq "windows_app") {
  Start-Process -FilePath "explorer.exe" -ArgumentList ("shell:AppsFolder\{0}" -f $App.Target)
} else {
  Start-Process -FilePath $App.Target
}

Write-Host "Codex desktop opened via $($App.Kind): $($App.Name)"
