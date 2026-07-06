# Send two test prints back-to-back through the bridge (bypasses Chrome).
# Run on DELIVERY01 after bridge restart:
#   powershell -ExecutionPolicy Bypass -File test-double-print.ps1

param(
  [string]$BridgeUrl = 'http://127.0.0.1:9101'
)

$ErrorActionPreference = 'Stop'
$BridgeDir = $PSScriptRoot
$LogFile = Join-Path $BridgeDir ("logs\server-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

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
  return $health
}

function Send-Print([int]$Attempt, [string]$PrinterIp) {
  $url = ($BridgeUrl.TrimEnd('/')) + '/print'
  Write-Host ""
  Write-Host "--- Print attempt $Attempt (bridge -> $PrinterIp) ---"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $result = Invoke-RestMethod -Method POST -Uri $url -Body $sampleZpl -ContentType 'text/plain' -TimeoutSec 120
    $sw.Stop()
    Write-Host "OK in $($sw.ElapsedMilliseconds)ms: $($result | ConvertTo-Json -Compress)"
  } catch {
    $sw.Stop()
    Write-Host "FAILED after $($sw.ElapsedMilliseconds)ms: $($_.Exception.Message)"
    throw
  }
}

Write-Host "BP RX bridge double-print test"
Write-Host "Log file: $LogFile"

$health = Test-Health
$printerIp = $health.printerIp
Write-Host "Bridge printer IP: $printerIp"

Send-Print -Attempt 1 -PrinterIp $printerIp
Start-Sleep -Seconds 2
Send-Print -Attempt 2 -PrinterIp $printerIp
Write-Host ""
Write-Host "Done. Check printer for TWO test labels."
Write-Host "Server log tail:"
Get-Content $LogFile -Tail 20
