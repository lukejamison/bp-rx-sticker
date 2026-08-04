# Kill zombie bridge processes and restart cleanly (fixes queueDepth stuck + port conflicts).
# Run from repo root as Administrator:
#   powershell -ExecutionPolicy Bypass -File extension\print-bridge\reset-bridge.ps1
#
# Stops the scheduled task FIRST so node is not immediately respawned while clearing the port.

$ErrorActionPreference = 'Continue'
$BridgeDir = $PSScriptRoot
$TaskName = 'BP-RX-PrintBridge'
$BridgePort = 9101
$BridgeHost = '127.0.0.1'

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Stop-BridgeProcesses {
  param([int]$Port)

  Write-Host "Stopping anything on port $Port ..."
  Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    ForEach-Object {
      if ($_.OwningProcess) {
        Write-Host "  kill PID $($_.OwningProcess) (port listener)"
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
      }
    }

  Write-Host 'Stopping print-bridge node processes ...'
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'print-bridge' -and $_.CommandLine -match 'server\.js' } |
    ForEach-Object {
      Write-Host "  kill PID $($_.ProcessId) (node)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

  Write-Host 'Stopping start-bridge.ps1 wrappers ...'
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and $_.Name -like 'powershell*' -and $_.CommandLine -match 'start-bridge\.ps1'
    } |
    ForEach-Object {
      Write-Host "  kill PID $($_.ProcessId) (powershell wrapper)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Write-Host 'BP RX - reset print bridge' -ForegroundColor Cyan

if (-not (Test-Admin)) {
  Write-Host 'WARN: Not running as Administrator. Port cleanup may fail.' -ForegroundColor Yellow
  Write-Host '      Right-click PowerShell -> Run as administrator, then re-run this script.' -ForegroundColor Yellow
}

$config = Join-Path $BridgeDir 'config.local.env'
if (Test-Path $config) {
  Get-Content $config | ForEach-Object {
    if ($_ -match '^\s*PRINT_BRIDGE_PORT\s*=\s*(\d+)\s*$') { $BridgePort = [int]$Matches[1] }
    if ($_ -match '^\s*PRINT_BRIDGE_HOST\s*=\s*(\S+)\s*$') { $BridgeHost = $Matches[1].Trim().Trim('"') }
  }
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Write-Host "Stopping scheduled task: $TaskName ..."
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
} else {
  Write-Host "WARN: Scheduled task '$TaskName' not found. Will only kill processes." -ForegroundColor Yellow
  Write-Host "      Run extension\print-bridge\install-windows.bat as Admin to register it." -ForegroundColor Yellow
}

Stop-BridgeProcesses -Port $BridgePort
Start-Sleep -Seconds 2

$still = Get-NetTCPConnection -LocalPort $BridgePort -State Listen -ErrorAction SilentlyContinue
if ($still) {
  Write-Host "ERROR: port $BridgePort still in use after cleanup." -ForegroundColor Red
  foreach ($conn in $still) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "  still listening: PID $($conn.OwningProcess) ($($proc.ProcessName))" -ForegroundColor Red
  }
  Write-Host 'Try: reboot, or run this script as Administrator.' -ForegroundColor Yellow
  exit 1
}

Write-Host "Port $BridgePort clear." -ForegroundColor Green

if (-not $task) {
  Write-Host 'No scheduled task to start. Exiting after cleanup.' -ForegroundColor Yellow
  exit 0
}

Write-Host "Starting scheduled task: $TaskName ..."
try {
  Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
} catch {
  Write-Host "ERROR: Could not start scheduled task: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Run extension\print-bridge\install-windows.bat as Administrator.' -ForegroundColor Yellow
  exit 1
}

Start-Sleep -Seconds 3

$healthUrl = "http://${BridgeHost}:$BridgePort/health"
Write-Host "Checking $healthUrl ..."
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 8
  Write-Host "Bridge healthy: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
  exit 0
} catch {
  Write-Host "WARN: /health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "Check logs: $BridgeDir\logs\" -ForegroundColor Yellow
  exit 1
}
