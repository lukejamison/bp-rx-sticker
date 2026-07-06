# Install BP RX Print Bridge as a Windows Scheduled Task (runs at logon + on restart)
#
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File extension/print-bridge/install-windows.ps1
#   powershell -ExecutionPolicy Bypass -File extension/print-bridge/install-windows.ps1 -PrinterIp 172.18.129.200
#   powershell -ExecutionPolicy Bypass -File extension/print-bridge/install-windows.ps1 -Uninstall
#
# Or double-click install-windows.bat (optionally pass printer IP as first argument)

param(
  [string]$PrinterIp = '',
  [int]$PrinterPort = 9100,
  [int]$BridgePort = 9101,
  [string]$BridgeHost = '127.0.0.1',
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$TaskName = 'BP-RX-PrintBridge'
$BridgeDir = $PSScriptRoot
$RepoRoot = Split-Path -Parent (Split-Path -Parent $BridgeDir)
$StartScript = Join-Path $BridgeDir 'start-bridge.ps1'
$ConfigPath = Join-Path $BridgeDir 'config.local.env'
$LogDir = Join-Path $BridgeDir 'logs'
$InstallLog = Join-Path $LogDir ("install-{0:yyyy-MM-dd-HHmmss}.log" -f (Get-Date))
$DefaultPrinterIp = '172.18.129.132'

function Write-InstallLog {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [string]$Level = 'INFO'
  )

  $line = '[{0:yyyy-MM-dd HH:mm:ss.fff}] [{1}] {2}' -f (Get-Date), $Level, $Message
  if (Test-Path $LogDir) {
    Add-Content -Path $InstallLog -Value $line -Encoding UTF8
  }
  Write-Host $line
}

function Read-ConfigValue {
  param([string]$Path, [string]$Key, [string]$Fallback)

  if (-not (Test-Path $Path)) { return $Fallback }
  foreach ($line in Get-Content -Path $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    if ($trimmed -match "^\s*$Key\s*=\s*(.+)\s*$") {
      return $Matches[1].Trim().Trim('"')
    }
  }
  return $Fallback
}

function Write-BridgeConfig {
  param(
    [string]$Ip,
    [int]$Port,
    [string]$ListenHost,
    [int]$BridgeListenPort
  )

  $content = @(
    '# BP RX Print Bridge — local config (machine-specific)'
    "# Updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    "# Re-run install-windows.ps1 after editing, or restart the scheduled task."
    ''
    "PRINTER_IP=$Ip"
    "PRINTER_PORT=$Port"
    "PRINT_BRIDGE_HOST=$ListenHost"
    "PRINT_BRIDGE_PORT=$BridgeListenPort"
    ''
  ) -join "`r`n"

  Set-Content -Path $ConfigPath -Value $content -Encoding UTF8
  Write-InstallLog "Wrote config: $ConfigPath"
  Write-InstallLog "  PRINTER_IP=$Ip"
  Write-InstallLog "  PRINTER_PORT=$Port"
  Write-InstallLog "  PRINT_BRIDGE_HOST=$ListenHost"
  Write-InstallLog "  PRINT_BRIDGE_PORT=$BridgeListenPort"
}

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Write-InstallLog '========== BP RX Print Bridge installer =========='
Write-InstallLog "Installer log: $InstallLog"
Write-InstallLog "Bridge directory: $BridgeDir"
Write-InstallLog "Repo root: $RepoRoot"
Write-InstallLog "PowerShell: $($PSVersionTable.PSVersion)"
Write-InstallLog "User: $env:USERDOMAIN\$env:USERNAME"
Write-InstallLog "Computer: $env:COMPUTERNAME"

if (-not (Test-Admin)) {
  Write-InstallLog 'Not running as Administrator. Scheduled task install may fail.' 'WARN'
  Write-InstallLog 'Right-click install-windows.bat → Run as administrator.' 'WARN'
}

if ($Uninstall) {
  Write-InstallLog "Uninstalling scheduled task: $TaskName"
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-InstallLog "Removed scheduled task: $TaskName"
  } else {
    Write-InstallLog "Scheduled task not found: $TaskName" 'WARN'
  }
  Write-InstallLog 'Uninstall complete. config.local.env and logs were left in place.'
  exit 0
}

if (-not (Test-Path $StartScript)) {
  Write-InstallLog "start-bridge.ps1 not found at $StartScript" 'ERROR'
  exit 1
}

$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
  Write-InstallLog 'Node.js not found on PATH. Install Node.js LTS first.' 'ERROR'
  exit 1
}
Write-InstallLog "Node.js: $nodeExe"

if (-not $PrinterIp) {
  $PrinterIp = Read-ConfigValue -Path $ConfigPath -Key 'PRINTER_IP' -Fallback $DefaultPrinterIp
  Write-InstallLog "No -PrinterIp argument; loaded existing/default IP: $PrinterIp"
}

Write-Host ''
Write-Host 'BP RX Print Bridge — printer configuration'
Write-Host 'Press Enter to keep the value in [brackets].'
Write-Host ''

$promptIp = Read-Host "Zebra printer IP [$PrinterIp]"
if ($promptIp) { $PrinterIp = $promptIp.Trim() }

$existingPort = [int](Read-ConfigValue -Path $ConfigPath -Key 'PRINTER_PORT' -Fallback "$PrinterPort")
$promptPort = Read-Host "Printer port [$existingPort]"
if ($promptPort) { $PrinterPort = [int]$promptPort } else { $PrinterPort = $existingPort }

$existingBridgePort = [int](Read-ConfigValue -Path $ConfigPath -Key 'PRINT_BRIDGE_PORT' -Fallback "$BridgePort")
$promptBridgePort = Read-Host "Bridge HTTP port [$existingBridgePort]"
if ($promptBridgePort) { $BridgePort = [int]$promptBridgePort } else { $BridgePort = $existingBridgePort }

$existingBridgeHost = Read-ConfigValue -Path $ConfigPath -Key 'PRINT_BRIDGE_HOST' -Fallback $BridgeHost
$promptBridgeHost = Read-Host "Bridge listen host [$existingBridgeHost]"
if ($promptBridgeHost) { $BridgeHost = $promptBridgeHost.Trim() } else { $BridgeHost = $existingBridgeHost }

Write-InstallLog '--- Configuration summary ---'
Write-BridgeConfig -Ip $PrinterIp -Port $PrinterPort -ListenHost $BridgeHost -BridgeListenPort $BridgePort

$psExe = (Get-Command powershell -ErrorAction Stop).Source
$taskArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""

Write-InstallLog 'Registering scheduled task ...'
Write-InstallLog "  Task name: $TaskName"
Write-InstallLog "  Execute: $psExe"
Write-InstallLog "  Arguments: $taskArgs"
Write-InstallLog "  Working directory: $BridgeDir"

$Action = New-ScheduledTaskAction -Execute $psExe -Argument $taskArgs -WorkingDirectory $BridgeDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn
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
  -Settings $Settings `
  -Description "BP RX Sticker print bridge (${BridgeHost}:${BridgePort} -> ${PrinterIp}:${PrinterPort})" `
  -Force | Out-Null

Write-InstallLog "Scheduled task registered: $TaskName"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-InstallLog "Task state before start: $($existing.State)"
}

Write-InstallLog 'Starting scheduled task ...'
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2

$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
Write-InstallLog "Task last run: $($taskInfo.LastRunTime)"
Write-InstallLog "Task last result: $($taskInfo.LastTaskResult)"
Write-InstallLog "Task state: $((Get-ScheduledTask -TaskName $TaskName).State)"

$healthUrl = "http://${BridgeHost}:${BridgePort}/health"
Write-InstallLog "Probing health endpoint: $healthUrl"
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
  Write-InstallLog "Health OK: $($health | ConvertTo-Json -Compress)"
} catch {
  Write-InstallLog "Health check failed (bridge may still be starting): $($_.Exception.Message)" 'WARN'
  Write-InstallLog "Check logs: $LogDir" 'WARN'
}

Write-Host ''
Write-Host 'Installed and started BP-RX-PrintBridge'
Write-Host "Printer:  ${PrinterIp}:${PrinterPort}"
Write-Host "Bridge:   http://${BridgeHost}:${BridgePort}/health"
Write-Host "Config:   $ConfigPath"
Write-Host "Logs:     $LogDir"
Write-Host "Install log: $InstallLog"
Write-Host ''
Write-Host 'To change printer IP later: edit config.local.env and re-run this installer,'
Write-Host 'or run:  powershell -ExecutionPolicy Bypass -File install-windows.ps1 -PrinterIp <new-ip>'
Write-Host ''
Write-Host 'Uninstall:  install-windows.ps1 -Uninstall'
Write-Host ''

Write-InstallLog '========== Install complete =========='
