# BP RX Sticker — Windows workstation cleanup (DELIVERY01 and other scan PCs)
# Finds duplicate repo copies, orphan bridge processes, and config drift.
#
# Usage (read-only report — safe default):
#   powershell -ExecutionPolicy Bypass -File cleanup-windows.ps1
#
# Apply fixes (kill orphan node, optional remove stale duplicate folders):
#   powershell -ExecutionPolicy Bypass -File cleanup-windows.ps1 -Apply
#   powershell -ExecutionPolicy Bypass -File cleanup-windows.ps1 -Apply -RemoveDuplicateRepos

param(
  [switch]$Apply,
  [switch]$RemoveDuplicateRepos
)

$ErrorActionPreference = 'Continue'
$BridgeTaskName = 'BP-RX-PrintBridge'
$MonitorTaskName = 'BP-RX-BridgeMonitor'
$BridgePort = 9101

function Write-Section($title) {
  Write-Host ''
  Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Write-Ok($msg) { Write-Host "  OK   $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  WARN $msg" -ForegroundColor Yellow }
function Write-Info($msg) { Write-Host "  INFO $msg" }

Write-Host 'BP RX Sticker — Windows cleanup' -ForegroundColor White
Write-Host "Mode: $(if ($Apply) { 'APPLY (will make changes)' } else { 'REPORT ONLY (pass -Apply to fix)' })"
Write-Host "Computer: $env:COMPUTERNAME  User: $env:USERDOMAIN\$env:USERNAME"

# --- Canonical install paths (edit if your PC uses a different layout) ---
$GitAppsRoot = Join-Path $env:USERPROFILE 'Documents\Git Apps'
$CanonicalPatterns = @(
  (Join-Path $GitAppsRoot 'bp-rx-sticker'),
  (Join-Path $GitAppsRoot 'bp-rx-sticker-main\bp-rx-sticker-main'),
  (Join-Path $GitAppsRoot 'bp-rx-sticker-main')
)

Write-Section 'Repo folders'
$repoHits = @()
if (Test-Path $GitAppsRoot) {
  Get-ChildItem -Path $GitAppsRoot -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^bp-rx-sticker' } |
    ForEach-Object {
      $hasExtension = Test-Path (Join-Path $_.FullName 'extension\manifest.json')
      $hasBridge = Test-Path (Join-Path $_.FullName 'extension\print-bridge\server.js')
      $repoHits += [PSCustomObject]@{
        Path = $_.FullName
        Extension = $hasExtension
        Bridge = $hasBridge
        Modified = $_.LastWriteTime
      }
    }
}

if ($repoHits.Count -eq 0) {
  Write-Warn "No bp-rx-sticker folders under: $GitAppsRoot"
  Write-Info 'Search manually if the repo lives elsewhere.'
} else {
  $repoHits | Sort-Object Modified -Descending | ForEach-Object {
    $flags = @()
    if ($_.Extension) { $flags += 'extension' }
    if ($_.Bridge) { $flags += 'bridge' }
    $line = "$($_.Path)  [$($flags -join ', ')]  modified $($_.Modified)"
    if ($repoHits.Count -gt 1) { Write-Warn $line } else { Write-Ok $line }
  }
  if ($repoHits.Count -gt 1) {
    Write-Warn 'Multiple repo copies found — Chrome should load unpacked extension from ONE folder only.'
    Write-Info 'Keep the newest copy with your latest zpl.js; delete or archive the rest after verifying prints.'
    $newest = ($repoHits | Sort-Object Modified -Descending | Select-Object -First 1).Path
    Write-Info "Suggested canonical path: $newest"

    if ($Apply -and $RemoveDuplicateRepos) {
      $toRemove = $repoHits | Where-Object { $_.Path -ne $newest }
      foreach ($dup in $toRemove) {
        Write-Warn "Removing duplicate: $($dup.Path)"
        Remove-Item -LiteralPath $dup.Path -Recurse -Force -ErrorAction SilentlyContinue
      }
    } elseif ($repoHits.Count -gt 1) {
      Write-Info 'To auto-remove older duplicates: re-run with -Apply -RemoveDuplicateRepos (review report first!).'
    }
  }
}

Write-Section 'Chrome extension (manual check)'
Write-Info 'Open chrome://extensions — ensure only ONE "BP RX Sticker" entry is loaded.'
Write-Info 'If two exist, Remove the old one; keep the folder that matches "Suggested canonical path" above.'
Write-Info 'After file updates: click Reload on the extension, then refresh OneScan.'

Write-Section 'Print bridge processes'
$bridgeNodes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'print-bridge' -and $_.CommandLine -match 'server\.js' }

$portListeners = Get-NetTCPConnection -LocalPort $BridgePort -State Listen -ErrorAction SilentlyContinue
if ($portListeners) {
  foreach ($conn in $portListeners) {
    $lpid = $conn.OwningProcess
    $inList = $bridgeNodes | Where-Object { $_.ProcessId -eq $lpid }
    if ($inList) {
      Write-Ok "Port $BridgePort listener PID $lpid (matches bridge node)"
    } else {
      Write-Warn "Port $BridgePort listener PID $lpid (ZOMBIE — not in bridge node list; blocks new bridge)"
    }
  }
} else {
  Write-Warn "Nothing listening on port $BridgePort"
}

if (-not $bridgeNodes -or $bridgeNodes.Count -eq 0) {
  Write-Warn 'No node print-bridge process running (bridge may be down).'
} elseif ($bridgeNodes.Count -eq 1) {
  Write-Ok "One bridge node PID $($bridgeNodes[0].ProcessId)"
} else {
  Write-Warn "Multiple bridge node processes ($($bridgeNodes.Count)) — can cause port $BridgePort conflicts."
  $bridgeNodes | ForEach-Object { Write-Info "  PID $($_.ProcessId)  $($_.CommandLine)" }
  if ($Apply) {
    $bridgeNodes | ForEach-Object {
      Write-Warn "Stopping PID $($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    Write-Info 'Restart bridge: tray app -> Restart print bridge, or run install-windows.bat as Admin'
  } else {
    Write-Info 'Pass -Apply to stop orphan node processes (then restart the bridge task).'
  }
}

Write-Section 'Scheduled tasks'
foreach ($taskName in @($BridgeTaskName, $MonitorTaskName)) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Warn "Task not found: $taskName"
    continue
  }
  $info = Get-ScheduledTaskInfo -TaskName $taskName
  $msg = "$taskName  State=$($task.State)  LastResult=$($info.LastTaskResult)  LastRun=$($info.LastRunTime)"
  if ($task.State -eq 'Running' -or $info.LastTaskResult -eq 0) {
    Write-Ok $msg
  } else {
    Write-Warn $msg
  }
}

Write-Section 'Bridge health'
$healthUrl = "http://127.0.0.1:${BridgePort}/health"
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
  if ($health.ok) {
    Write-Ok "Bridge healthy at $healthUrl  printer=$($health.printerIp)"
  } else {
    Write-Warn "Bridge responded but ok=false at $healthUrl"
  }
} catch {
  Write-Warn "Bridge not reachable at $healthUrl — $($_.Exception.Message)"
  if ($Apply) {
    Write-Info 'Try: tray -> Restart print bridge, or install-windows.bat as Administrator'
  }
}

Write-Section 'Key files (canonical repo)'
$canonical = $null
if ($repoHits.Count -gt 0) {
  $canonical = ($repoHits | Sort-Object Modified -Descending | Select-Object -First 1).Path
}
if ($canonical) {
  $checkFiles = @(
    'extension\lib\zpl.js',
    'extension\lib\api.js',
    'extension\print-bridge\server.js',
    'extension\print-bridge\start-bridge.ps1',
    'extension\print-bridge\config.local.env'
  )
  foreach ($rel in $checkFiles) {
    $full = Join-Path $canonical $rel
    if (Test-Path $full) {
      $item = Get-Item $full
      Write-Ok "$rel  ($($item.Length) bytes, $($item.LastWriteTime))"
    } else {
      Write-Warn "Missing: $rel"
    }
  }
}

Write-Section 'Done'
if (-not $Apply) {
  Write-Info 'This was a report only. To apply safe fixes: cleanup-windows.bat apply'
}
