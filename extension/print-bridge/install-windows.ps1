# Install BP RX Print Bridge as a Windows Scheduled Task (runs at logon + on restart)
# Run PowerShell as Administrator from repo root:
#   powershell -ExecutionPolicy Bypass -File extension/print-bridge/install-windows.ps1

$ErrorActionPreference = 'Stop'

$TaskName = 'BP-RX-PrintBridge'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ServerScript = Join-Path $RepoRoot 'extension/print-bridge/server.js'
$NodeExe = (Get-Command node -ErrorAction Stop).Source

if (-not (Test-Path $ServerScript)) {
  throw "server.js not found at $ServerScript"
}

$Action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$ServerScript`"" -WorkingDirectory (Split-Path $ServerScript)
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description 'BP RX Sticker print bridge (localhost:9101 -> Zebra :9100)' -Force

Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed and started $TaskName"
Write-Host "Health: http://127.0.0.1:9101/health"
Write-Host "Print:  http://127.0.0.1:9101/print"
