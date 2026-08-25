$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$StartScript = Join-Path $ProjectRoot "scripts\start-local.ps1"
$CodexLauncher = Join-Path $ProjectRoot "scripts\start-codex.ps1"
$PluginInstaller = Join-Path $ProjectRoot "scripts\install-codex-plugin.ps1"
$FirstRun =
  -not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules")) -or
  -not (Test-Path -LiteralPath (Join-Path $ProjectRoot "dist\index.js"))

if (-not (Test-Path -LiteralPath $StartScript -PathType Leaf)) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "找不到启动脚本。请重新解压完整交付包。`n`nStartup script is missing. Please restore the complete package.",
    "Co-founder Investment Office",
    "OK",
    "Error"
  ) | Out-Null
  exit 1
}

if ($FirstRun) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "首次启动需要准备本地运行环境，可能需要几分钟。进度窗口会自动打开。`n`nFirst launch may take a few minutes while the local runtime is prepared.",
    "Co-founder Investment Office",
    "OK",
    "Information"
  ) | Out-Null
}

$WindowStyle = if ($FirstRun) { "Normal" } else { "Hidden" }
$Process = Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", ('"{0}"' -f $StartScript)
) -WorkingDirectory $ProjectRoot -WindowStyle $WindowStyle -Wait -PassThru

if ($Process.ExitCode -ne 0) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "本地工作台未能启动。请打开 data\server.stderr.log，或把错误交给 Codex 检查。`n`nThe local workspace could not start. Ask Codex to inspect the local service log.",
    "Co-founder Investment Office",
    "OK",
    "Error"
  ) | Out-Null
  exit $Process.ExitCode
}

try {
  & $PluginInstaller -Quiet
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "看板已经打开，但 Cofound 的 Codex 分析能力没有完成加载。请重新运行桌面的安装程序，或把这个提示交给 Codex 检查。`n`nThe dashboard is ready, but the Cofound Codex plugin could not be loaded.",
    "Co-founder Investment Office",
    "OK",
    "Warning"
  ) | Out-Null
}

try {
  & $CodexLauncher | Out-Null
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "看板已经打开，但没有找到 Codex 桌面应用。请手动打开 Codex，并说：查看 Cofound 当前项目，告诉我今天优先处理什么。`n`nThe dashboard is ready, but Codex could not be opened automatically.",
    "Co-founder Investment Office",
    "OK",
    "Warning"
  ) | Out-Null
}
