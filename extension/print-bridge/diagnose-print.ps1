# BP RX — one-shot print diagnostics for DELIVERY01 (or any scan PC).
# Collects everything IT needs in one file. Run:
#   powershell -ExecutionPolicy Bypass -File extension\print-bridge\diagnose-print.ps1
#
# Paste the output file path (or contents) back to IT.

$ErrorActionPreference = 'Continue'
$BridgeDir = $PSScriptRoot
$RepoRoot = Split-Path (Split-Path $BridgeDir -Parent) -Parent
$LogDir = Join-Path $BridgeDir 'logs'
$ConfigPath = Join-Path $BridgeDir 'config.local.env'
$ServerLog = Join-Path $LogDir ("server-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))
$WrapperLog = Join-Path $LogDir ("bridge-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))
$OutFile = Join-Path $LogDir ("diagnose-{0}.txt" -f (Get-Date -Format 'yyyy-MM-dd-HHmmss'))

function Section([string]$Title) {
  $line = "`n========== $Title =========="
  Write-Host $line
  Add-Content -Path $OutFile -Value $line
}

function Write-Report([string]$Text) {
  Write-Host $Text
  Add-Content -Path $OutFile -Value $Text
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Remove-Item -Path $OutFile -ErrorAction SilentlyContinue

Section 'Machine'
Write-Report "Time:    $(Get-Date -Format o)"
Write-Report "Computer: $env:COMPUTERNAME"
Write-Report "User:     $env:USERDOMAIN\$env:USERNAME"
Write-Report "Repo:     $RepoRoot"

Section 'Config'
if (Test-Path $ConfigPath) {
  Write-Report (Get-Content $ConfigPath -Raw)
} else {
  Write-Report "MISSING: $ConfigPath"
}

Section 'Port 9101 (bridge)'
$listeners = Get-NetTCPConnection -LocalPort 9101 -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
  foreach ($l in $listeners) {
    $proc = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue
    Write-Report "LISTEN pid=$($l.OwningProcess) process=$($proc.ProcessName) path=$($proc.Path)"
  }
} else {
  Write-Report 'NOT LISTENING — bridge is not running on 9101'
}

Section 'Node processes (print-bridge)'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'print-bridge' } |
  ForEach-Object {
    Write-Report "PID $($_.ProcessId): $($_.CommandLine)"
  }

Section 'Scheduled task'
$task = Get-ScheduledTask -TaskName 'BP-RX-PrintBridge' -ErrorAction SilentlyContinue
if ($task) {
  $info = Get-ScheduledTaskInfo -TaskName 'BP-RX-PrintBridge' -ErrorAction SilentlyContinue
  Write-Report "State: $($task.State)  LastResult: $($info.LastTaskResult)  LastRun: $($info.LastRunTime)"
} else {
  Write-Report 'Task BP-RX-PrintBridge not found'
}

Section 'Bridge health'
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:9101/health' -TimeoutSec 5
  Write-Report ($health | ConvertTo-Json -Depth 4)
  if ($health.queueDepth -gt 0) {
    Write-Report "CRITICAL: queueDepth=$($health.queueDepth) — a print job is STUCK. Run reset-bridge.ps1"
  }
  $listenerPid = (Get-NetTCPConnection -LocalPort 9101 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
  if ($health.pid -and $listenerPid -and $health.pid -ne $listenerPid) {
    Write-Report "CRITICAL: health pid=$($health.pid) but port 9101 owned by PID $listenerPid — zombie bridge. Run reset-bridge.ps1"
  }
  if (-not $health.bridgeVersion) {
    Write-Report 'WARN: bridgeVersion missing — old server.js. git pull then reset-bridge.ps1'
  } elseif ($health.bridgeVersion -ne '0.4.3') {
    Write-Report "WARN: bridgeVersion=$($health.bridgeVersion) expected 0.4.3 — git pull then reset-bridge.ps1"
  }
  $printerIp = $health.printerIp
} catch {
  Write-Report "HEALTH FAILED: $($_.Exception.Message)"
  $printerIp = '172.18.129.123'
  if (Test-Path $ConfigPath) {
    Get-Content $ConfigPath | ForEach-Object {
      if ($_ -match '^\s*PRINTER_IP\s*=\s*(.+)\s*$') { $printerIp = $Matches[1].Trim().Trim('"') }
    }
  }
}

Section "Printer TCP $printerIp`:9100"
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $async = $tcp.BeginConnect($printerIp, 9100, $null, $null)
  $ok = $async.AsyncWaitHandle.WaitOne(3000, $false)
  if ($ok -and $tcp.Connected) {
    Write-Report "OK — TCP connect to ${printerIp}:9100 succeeded"
    $tcp.Close()
  } else {
    Write-Report "FAIL — TCP connect to ${printerIp}:9100 timed out (printer offline or wrong IP)"
  }
} catch {
  Write-Report "FAIL — $($_.Exception.Message)"
}

Section 'Test print via bridge'
$sampleZpl = @'
^XA
^PW203
^LL203
^FO10,20^A0N,24,24^FDDIAG TEST^FS
^XZ
'@
try {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $result = Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:9101/print' `
    -Body $sampleZpl -ContentType 'text/plain' -TimeoutSec 60
  $sw.Stop()
  Write-Report "OK in $($sw.ElapsedMilliseconds)ms: $($result | ConvertTo-Json -Compress)"
} catch {
  Write-Report "PRINT FAILED: $($_.Exception.Message)"
}

Section "Server log tail ($ServerLog)"
if (Test-Path $ServerLog) {
  Get-Content $ServerLog -Tail 40 | ForEach-Object { Write-Report $_ }
} else {
  Write-Report "MISSING — bridge node never wrote server log (node not started or wrong path)"
}

Section "Wrapper log tail ($WrapperLog)"
if (Test-Path $WrapperLog) {
  Get-Content $WrapperLog -Tail 20 | ForEach-Object { Write-Report $_ }
} else {
  Write-Report 'MISSING'
}

Section 'Chrome extension checklist (manual)'
Write-Report @'
1. chrome://extensions → BP RX Sticker v0.4.1+ → Reload
2. Options → Mock print OFF, Printer IP = 172.18.129.123, Save
3. Options → Check bridge → should say OK
4. Service worker → Inspect → reproduce scan → copy [BP-RX Sticker BG] lines
'@

Section 'Done'
Write-Report "Full report saved to:"
Write-Report $OutFile
Write-Host "`nOpen this file and paste contents to IT: $OutFile" -ForegroundColor Cyan
