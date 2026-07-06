# Kill zombie bridge processes and restart cleanly (fixes queueDepth stuck + port conflicts).
# Run on DELIVERY01:
#   powershell -ExecutionPolicy Bypass -File extension\print-bridge\reset-bridge.ps1

$ErrorActionPreference = 'Continue'
$BridgeDir = $PSScriptRoot
$BridgePort = 9101

Write-Host 'BP RX — reset print bridge' -ForegroundColor Cyan

# Load port from config if present
$config = Join-Path $BridgeDir 'config.local.env'
if (Test-Path $config) {
  Get-Content $config | ForEach-Object {
    if ($_ -match '^\s*PRINT_BRIDGE_PORT\s*=\s*(\d+)\s*$') { $BridgePort = [int]$Matches[1] }
  }
}

Write-Host "Stopping anything on port $BridgePort ..."
Get-NetTCPConnection -LocalPort $BridgePort -ErrorAction SilentlyContinue |
  ForEach-Object {
    if ($_.OwningProcess) {
      Write-Host "  kill PID $($_.OwningProcess)"
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }

Write-Host 'Stopping all print-bridge node processes ...'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'print-bridge' -and $_.CommandLine -match 'server\.js' } |
  ForEach-Object {
    Write-Host "  kill PID $($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Start-Sleep -Seconds 2

$still = Get-NetTCPConnection -LocalPort $BridgePort -State Listen -ErrorAction SilentlyContinue
if ($still) {
  Write-Host "ERROR: port $BridgePort still in use. Reboot or run as Administrator." -ForegroundColor Red
  exit 1
}

Write-Host 'Port clear. Starting bridge ...' -ForegroundColor Green
& (Join-Path $BridgeDir 'start-bridge.ps1')
