# Send two test prints back-to-back through the bridge (bypasses Chrome).
# Run on DELIVERY01 after bridge restart:
#   powershell -ExecutionPolicy Bypass -File test-double-print.ps1
#   powershell -ExecutionPolicy Bypass -File test-double-print.ps1 -PrinterIp 172.18.129.123

param(
  [string]$PrinterIp = '',
  [string]$BridgeUrl = 'http://127.0.0.1:9101'
)

$ErrorActionPreference = 'Stop'
$BridgeDir = $PSScriptRoot
$ConfigPath = Join-Path $BridgeDir 'config.local.env'

if (-not $PrinterIp -and (Test-Path $ConfigPath)) {
  Get-Content $ConfigPath | ForEach-Object {
    if ($_ -match '^\s*PRINTER_IP\s*=\s*(.+)\s*$') {
      $PrinterIp = $Matches[1].Trim().Trim('"')
    }
  }
}
if (-not $PrinterIp) { $PrinterIp = '172.18.129.132' }

$sampleZpl = @'
^XA
^PW203
^LL203
^FO10,20^A0N,24,24^FDTEST DOUBLE PRINT^FS
^FO10,60^A0N,18,18^FDIf you see two labels, bridge is OK^FS
^XZ
'@

function Test-Health {
  $url = ($BridgeUrl.TrimEnd('/')) + '/health'
  Write-Host "Health: $url"
  $health = Invoke-RestMethod -Uri $url -TimeoutSec 5
  $health | ConvertTo-Json -Compress
  if (-not $health.ok) { throw 'Bridge health check failed' }
}

function Send-Print([int]$Attempt) {
  $url = ($BridgeUrl.TrimEnd('/')) + '/print'
  Write-Host "`n--- Print attempt $Attempt -> $PrinterIp ---"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $result = Invoke-RestMethod -Method POST -Uri $url -Body $sampleZpl -ContentType 'text/plain' `
      -Headers @{ 'X-Printer-IP' = $PrinterIp } -TimeoutSec 120
    $sw.Stop()
    Write-Host "OK in $($sw.ElapsedMilliseconds)ms: $($result | ConvertTo-Json -Compress)"
  } catch {
    $sw.Stop()
    Write-Host "FAILED after $($sw.ElapsedMilliseconds)ms: $($_.Exception.Message)"
    throw
  }
}

Write-Host "BP RX bridge double-print test"
Write-Host "Printer IP: $PrinterIp"
Write-Host "Log file: $(Join-Path $BridgeDir 'logs\server-' + (Get-Date -Format 'yyyy-MM-dd') + '.log')"

Test-Health
Send-Print -Attempt 1
Start-Sleep -Seconds 2
Send-Print -Attempt 2
Write-Host "`nDone. Check printer for TWO test labels."
