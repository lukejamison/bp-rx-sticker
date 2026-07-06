# One test label through the bridge - copy/paste safe for DELIVERY01.
#   powershell -ExecutionPolicy Bypass -File extension\print-bridge\test-one-print.ps1

$ErrorActionPreference = 'Stop'

$zpl = @'
^XA
^PW203
^LL203
^FO10,20^A0N,28,28^FDTEST PRINT^FS
^FO10,55^A0N,18,18^FDBridge OK^FS
^XZ
'@

Write-Host 'Health check...'
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:9101/health' -TimeoutSec 5
$health | Format-List

Write-Host "`nSending test print..."
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$result = Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:9101/print' `
  -Body $zpl -ContentType 'text/plain' -TimeoutSec 60
$sw.Stop()

Write-Host "OK in $($sw.ElapsedMilliseconds)ms"
$result | Format-List
