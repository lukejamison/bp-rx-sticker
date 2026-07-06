# Install BP RX Bridge Monitor as a Windows Scheduled Task (runs at logon, highest privileges)
# Run PowerShell as Administrator:
#   powershell -ExecutionPolicy Bypass -File windows-monitor/install-monitor.ps1
#
# Requires: build.bat already ran → publish\BpRx.BridgeMonitor.exe exists

param(
    [string]$ExePath = '',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$TaskName = 'BP-RX-BridgeMonitor'
$MonitorDir = $PSScriptRoot
$DefaultExe = Join-Path $MonitorDir 'publish\BpRx.BridgeMonitor.exe'
$LogDir = Join-Path $MonitorDir 'logs'
$InstallLog = Join-Path $LogDir ("install-monitor-{0:yyyy-MM-dd-HHmmss}.log" -f (Get-Date))

function Write-InstallLog {
    param([string]$Message, [string]$Level = 'INFO')
    $line = '[{0:yyyy-MM-dd HH:mm:ss.fff}] [{1}] {2}' -f (Get-Date), $Level, $Message
    if (Test-Path $LogDir) { Add-Content -Path $InstallLog -Value $line -Encoding UTF8 }
    Write-Host $line
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Write-InstallLog '========== BP RX Bridge Monitor installer =========='

if ($Uninstall) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-InstallLog "Removed scheduled task: $TaskName"
    } else {
        Write-InstallLog "Task not found: $TaskName" 'WARN'
    }
    exit 0
}

if (-not $ExePath) { $ExePath = $DefaultExe }
$ExePath = (Resolve-Path -LiteralPath $ExePath -ErrorAction Stop).Path

if (-not (Test-Path $ExePath)) {
    Write-InstallLog "Monitor exe not found: $ExePath" 'ERROR'
    Write-InstallLog 'Run build.bat first, then re-run this installer.' 'ERROR'
    exit 1
}

Write-InstallLog "Monitor exe: $ExePath"
Write-InstallLog "Task name: $TaskName (RunLevel: Highest — Administrator)"

$Action = New-ScheduledTaskAction -Execute $ExePath -WorkingDirectory (Split-Path $ExePath)
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Principal $Principal `
    -Settings $Settings `
    -Description 'BP RX Bridge Monitor tray app (admin — health, restart bridge, send logs)' `
    -Force | Out-Null

Write-InstallLog 'Starting monitor task ...'
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2

$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-InstallLog "Task state: $((Get-ScheduledTask -TaskName $TaskName).State)"
Write-InstallLog "Last result: $($info.LastTaskResult)"
Write-InstallLog 'UAC: monitor runs elevated for bridge restart/debug controls.'
Write-InstallLog "Install log: $InstallLog"
Write-InstallLog '========== Install complete =========='

Write-Host ''
Write-Host 'Installed BP-RX-BridgeMonitor (Administrator / Highest)'
Write-Host 'Look for the tray icon near the clock.'
Write-Host ''
