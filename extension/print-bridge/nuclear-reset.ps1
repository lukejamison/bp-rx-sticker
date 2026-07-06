# BP RX Print Bridge — NUCLEAR RESET
#
# Wipes every trace of the bridge (scheduled task, all node/powershell processes,
# anything holding port 9101) and reinstalls it clean, fully automated — no prompts.
#
# HOW TO RUN (PowerShell ISE):
#   1. Open this file in ISE (right-click -> Edit, or File -> Open)
#   2. Run ISE "as Administrator" if you can (scheduled task step needs it —
#      the script still does everything else and tells you clearly if it's missing)
#   3. Press F5, or click the green Run button
#
# It ends with a clear PASS/FAIL summary and 3 back-to-back live test prints.

param(
  [string]$PrinterIp = ''
)

$ErrorActionPreference = 'Continue'
$BridgeDir = $PSScriptRoot
$RepoRoot = Split-Path (Split-Path $BridgeDir -Parent) -Parent
$TaskName = 'BP-RX-PrintBridge'
$BridgePort = 9101
$ConfigPath = Join-Path $BridgeDir 'config.local.env'
$LogDir = Join-Path $BridgeDir 'logs'
$StartScript = Join-Path $BridgeDir 'start-bridge.ps1'
$ServerScript = Join-Path $BridgeDir 'server.js'

function Write-Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Good($msg) { Write-Host "   OK   $msg" -ForegroundColor Green }
function Write-Bad($msg)  { Write-Host "   FAIL $msg" -ForegroundColor Red }
function Write-Note($msg) { Write-Host "   ..   $msg" -ForegroundColor Yellow }

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host '=====================================================' -ForegroundColor White
Write-Host ' BP RX PRINT BRIDGE — NUCLEAR RESET'                    -ForegroundColor White
Write-Host '=====================================================' -ForegroundColor White
Write-Host "Repo: $RepoRoot"
Write-Host "Bridge dir: $BridgeDir"
Write-Host "Admin: $(if (Test-Admin) { 'YES' } else { 'NO — scheduled task step may fail, see note at end' })"

# ---------------------------------------------------------------------------
Write-Step 'Step 1: Stop and remove the scheduled task'
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Good "Removed scheduled task: $TaskName"
} else {
  Write-Note "No scheduled task named $TaskName found (nothing to remove)"
}

# ---------------------------------------------------------------------------
Write-Step 'Step 2: Kill everything holding bridge port 9101'
$killedPorts = 0
foreach ($conn in (Get-NetTCPConnection -LocalPort $BridgePort -ErrorAction SilentlyContinue)) {
  if ($conn.OwningProcess) {
    Write-Note "Killing PID $($conn.OwningProcess) (listening on $BridgePort)"
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    $killedPorts++
  }
}
Write-Good "Killed $killedPorts process(es) on port $BridgePort"

# ---------------------------------------------------------------------------
Write-Step 'Step 3: Kill every bridge-related node/powershell process (any repo copy, any window)'
$killedProcs = 0
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.CommandLine -and (
      ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'print-bridge.*server\.js') -or
      ($_.Name -like 'powershell*' -and $_.CommandLine -match 'start-bridge\.ps1')
    )
  } |
  ForEach-Object {
    Write-Note "Killing PID $($_.ProcessId): $($_.Name) — $($_.CommandLine)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    $killedProcs++
  }
Write-Good "Killed $killedProcs bridge process(es)"

Start-Sleep -Seconds 2

$stillListening = Get-NetTCPConnection -LocalPort $BridgePort -State Listen -ErrorAction SilentlyContinue
if ($stillListening) {
  $stuckPids = ($stillListening | Select-Object -ExpandProperty OwningProcess) -join ', '
  Write-Bad "Port $BridgePort is STILL in use by PID(s) $stuckPids — reboot the PC before continuing"
  Write-Host "`nStopping here — reboot and re-run this script." -ForegroundColor Red
  return
}
Write-Good "Port $BridgePort is clear"

# ---------------------------------------------------------------------------
Write-Step 'Step 3b: Pause the tray monitor app (if running) so it does not fight this reset'
$monitorStopped = $false
Get-Process -Name 'BpRx.BridgeMonitor' -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Note "Stopping tray monitor PID $($_.Id)"
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  $monitorStopped = $true
}
$monitorTask = Get-ScheduledTask -TaskName 'BP-RX-BridgeMonitor' -ErrorAction SilentlyContinue
if ($monitorTask -and $monitorTask.State -eq 'Running') {
  Stop-ScheduledTask -TaskName 'BP-RX-BridgeMonitor' -ErrorAction SilentlyContinue
  $monitorStopped = $true
}
if ($monitorStopped) {
  Write-Good 'Tray monitor paused — remember to relaunch it manually after this finishes'
} else {
  Write-Note 'Tray monitor was not running (nothing to pause)'
}

# ---------------------------------------------------------------------------
Write-Step 'Step 4: Archive old logs (keeps history, gives a clean slate)'
if (Test-Path $LogDir) {
  $archiveDir = Join-Path $BridgeDir ("logs-archive-{0:yyyy-MM-dd-HHmmss}" -f (Get-Date))
  try {
    Move-Item -Path $LogDir -Destination $archiveDir -Force
    Write-Good "Archived old logs to: $archiveDir"
  } catch {
    Write-Note "Could not archive logs (leaving in place): $($_.Exception.Message)"
  }
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ---------------------------------------------------------------------------
Write-Step 'Step 5: Pull latest code from GitHub'
if (Test-Path (Join-Path $RepoRoot '.git')) {
  Push-Location $RepoRoot
  try {
    $pullOutput = git pull 2>&1 | Out-String
    Write-Host $pullOutput.Trim()
    Write-Good 'git pull complete'
  } catch {
    Write-Note "git pull failed (continuing with code already on disk): $($_.Exception.Message)"
  } finally {
    Pop-Location
  }
} else {
  Write-Note "$RepoRoot is not a git repo — skipping git pull"
}

# ---------------------------------------------------------------------------
Write-Step 'Step 6: Write a fresh config.local.env'
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
  $fallback = 'C:\Program Files\nodejs\node.exe'
  if (Test-Path $fallback) { $nodeExe = $fallback }
}
if (-not $nodeExe) {
  Write-Bad 'Node.js not found on this machine. Install Node.js LTS, then re-run this script.'
  return
}
Write-Good "Node.js: $nodeExe"

if (-not $PrinterIp) {
  $PrinterIp = '172.18.129.123'
  if (Test-Path $ConfigPath) {
    Get-Content $ConfigPath | ForEach-Object {
      if ($_ -match '^\s*PRINTER_IP\s*=\s*(.+)\s*$') { $PrinterIp = $Matches[1].Trim().Trim('"') }
    }
  }
}

$configContent = @(
  '# BP RX Print Bridge - local config (machine-specific)'
  "# Rewritten by nuclear-reset.ps1: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  ''
  "NODE_EXE=$nodeExe"
  "PRINTER_IP=$PrinterIp"
  'PRINTER_PORT=9100'
  'PRINT_BRIDGE_HOST=127.0.0.1'
  "PRINT_BRIDGE_PORT=$BridgePort"
  ''
) -join "`r`n"
Set-Content -Path $ConfigPath -Value $configContent -Encoding UTF8
Write-Good "Wrote $ConfigPath (PRINTER_IP=$PrinterIp)"

# ---------------------------------------------------------------------------
Write-Step 'Step 7: Register a fresh scheduled task (auto-start at logon, auto-restart)'
if (-not (Test-Admin)) {
  Write-Bad 'Not running as Administrator — cannot register the scheduled task.'
  Write-Note 'Close this, reopen PowerShell ISE with "Run as administrator", and re-run this script.'
  Write-Note "For now, starting the bridge manually instead (won't survive reboot/logoff)."
  Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`"" -WindowStyle Normal
  Start-Sleep -Seconds 3
} else {
  try {
    $psExe = (Get-Command powershell -ErrorAction Stop).Source
    $taskArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
    $action = New-ScheduledTaskAction -Execute $psExe -Argument $taskArgs -WorkingDirectory $BridgeDir
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -RestartCount 999 `
      -RestartInterval (New-TimeSpan -Minutes 1) `
      -ExecutionTimeLimit ([TimeSpan]::Zero)

    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
      -Description "BP RX Sticker print bridge (127.0.0.1:$BridgePort -> ${PrinterIp}:9100)" -Force | Out-Null
    Write-Good "Registered scheduled task: $TaskName"

    Start-ScheduledTask -TaskName $TaskName
    Write-Good 'Started scheduled task'
  } catch {
    Write-Bad "Scheduled task registration failed: $($_.Exception.Message)"
    Write-Note 'Starting the bridge manually instead.'
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`"" -WindowStyle Normal
  }
}

# ---------------------------------------------------------------------------
Write-Step 'Step 8: Wait for bridge to come up'
$health = $null
for ($i = 1; $i -le 10; $i++) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$BridgePort/health" -TimeoutSec 3
    if ($health.ok) { break }
  } catch {
    Write-Note "Waiting for bridge... ($i/10)"
  }
}

if (-not $health -or -not $health.ok) {
  Write-Bad 'Bridge did not come up after 10 seconds.'
  Write-Note "Check logs in: $LogDir"
  return
}

Write-Good "Bridge is up: $($health | ConvertTo-Json -Compress)"
if ($health.queueDepth -gt 0) {
  Write-Bad "queueDepth=$($health.queueDepth) — a job is stuck immediately after a clean start. Something is very wrong; send this whole output."
}

# ---------------------------------------------------------------------------
Write-Step 'Step 9: Printer reachability check'
$printerOk = $false
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $async = $tcp.BeginConnect($health.printerIp, 9100, $null, $null)
  $printerOk = $async.AsyncWaitHandle.WaitOne(3000, $false) -and $tcp.Connected
  $tcp.Close()
} catch {
  $printerOk = $false
}
if ($printerOk) {
  Write-Good "Printer $($health.printerIp):9100 is reachable"
} else {
  Write-Bad "Printer $($health.printerIp):9100 is NOT reachable — check the printer is powered on and on the network"
}

# ---------------------------------------------------------------------------
Write-Step 'Step 10: Three back-to-back live test prints'
$sampleZpl = @'
^XA
^PW203
^LL203
^FO10,20^A0N,26,26^FDNUCLEAR RESET^FS
^FO10,55^A0N,18,18^FDTest print #{0}^FS
^XZ
'@

$results = @()
for ($i = 1; $i -le 3; $i++) {
  $body = $sampleZpl -f $i
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $r = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:$BridgePort/print" -Body $body -ContentType 'text/plain' -TimeoutSec 30
    $sw.Stop()
    Write-Good "Print $i/3 OK in $($sw.ElapsedMilliseconds)ms"
    $results += $true
  } catch {
    $sw.Stop()
    Write-Bad "Print $i/3 FAILED after $($sw.ElapsedMilliseconds)ms: $($_.Exception.Message)"
    $results += $false
  }
  Start-Sleep -Milliseconds 500
}

# ---------------------------------------------------------------------------
Write-Host "`n=====================================================" -ForegroundColor White
if (($results -notcontains $false) -and $printerOk -and $health.ok) {
  Write-Host ' RESULT: PASS — bridge reset clean, 3/3 prints succeeded' -ForegroundColor Green
  Write-Host ' Next: reload the Chrome extension (chrome://extensions -> Reload),' -ForegroundColor Green
  Write-Host ' then try a real scan.' -ForegroundColor Green
} else {
  Write-Host ' RESULT: FAIL — see FAIL lines above' -ForegroundColor Red
  Write-Host " Send this entire output, plus: $LogDir\server-$(Get-Date -Format 'yyyy-MM-dd').log" -ForegroundColor Red
}
Write-Host '=====================================================' -ForegroundColor White

if (-not (Test-Admin)) {
  Write-Host "`nNOTE: scheduled task was not installed (not running as Administrator)." -ForegroundColor Yellow
  Write-Host 'The bridge is running now but will NOT survive logoff/reboot until you' -ForegroundColor Yellow
  Write-Host 're-run this script (or install-windows.ps1) as Administrator.' -ForegroundColor Yellow
}

if ($monitorStopped) {
  Write-Host "`nNOTE: the tray monitor app was paused during this reset — relaunch it manually." -ForegroundColor Yellow
}
