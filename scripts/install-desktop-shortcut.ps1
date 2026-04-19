# Installs a "Lane Manager" shortcut on the Windows desktop.
# Usage from repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\install-desktop-shortcut.ps1

$ErrorActionPreference = "Stop"

$RepoRoot   = Resolve-Path (Join-Path $PSScriptRoot "..")
$Launcher   = Join-Path $RepoRoot "scripts\launch.bat"
$Desktop    = [Environment]::GetFolderPath("Desktop")
$Shortcut   = Join-Path $Desktop "Lane Manager.lnk"

if (-not (Test-Path $Launcher)) {
    Write-Error "Launcher not found: $Launcher"
    exit 1
}

$Shell = New-Object -ComObject WScript.Shell
$Link  = $Shell.CreateShortcut($Shortcut)
$Link.TargetPath       = "cmd.exe"
$Link.Arguments        = "/k `"$Launcher`""
$Link.WorkingDirectory = "$RepoRoot"
$Link.WindowStyle      = 1
$Link.Description      = "Lane Manager — multi-lane Claude orchestrator"
# Use an existing Windows icon as a simple default
$Link.IconLocation     = "$env:SystemRoot\System32\imageres.dll,109"
$Link.Save()

Write-Host "Created shortcut: $Shortcut"
Write-Host "Launcher:         $Launcher"
