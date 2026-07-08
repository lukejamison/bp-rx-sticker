# BP RX Print Bridge - process wrapper (used by Windows Scheduled Task)
# Loads config.local.env, logs to logs/, runs server.js (restarts if node exits)

$ErrorActionPreference = 'Continue'

$BridgeDir = $PSScriptRoot
$LogDir = Join-Path $BridgeDir 'logs'
$ConfigPath = Join-Path $BridgeDir 'config.local.env'
$ServerScript = Join-Path $BridgeDir 'server.js'
$LogFile = Join-Path $LogDir ("bridge-{0:yyyy-MM-dd}.log" -f (Get-Date))
$RestartDelaySec = 5

function Write-BridgeLog {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [string]$Level = 'INFO'
  )

  $line = '[{0:yyyy-MM-dd HH:mm:ss.fff}] [{1}] {2}' -f (Get-Date), $Level, $Message
  try {
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
  } catch {
    Write-Host $line
  }
  Write-Host $line
}

function Import-BridgeEnvFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    Write-BridgeLog "Config file not found: $Path (using defaults / existing env)" 'WARN'
    return
  }

  Write-BridgeLog "Loading config: $Path"
  Get-Content -Path $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }

    $eq = $line.IndexOf('=')
    if ($eq -lt 1) {
      Write-BridgeLog "Skipping invalid config line: $line" 'WARN'
      return
    }

    $key = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    Set-Item -Path "Env:$key" -Value $value
    $logValue = if ($key -match 'TOKEN|SECRET|PASSWORD') { '***' } else { $value }
    Write-BridgeLog "  $key=$logValue"
  }
}

function Resolve-NodeExe {
  if ($env:NODE_EXE -and (Test-Path $env:NODE_EXE)) {
    return $env:NODE_EXE
  }

  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    return $cmd.Source
  }

  $candidates = @(
    'C:\Program Files\nodejs\node.exe',
    'C:\Program Files (x86)\nodejs\node.exe'
  )
  foreach ($path in $candidates) {
    if (Test-Path $path) { return $path }
  }

  return $null
}

function Stop-BridgePortListeners {
  param([int]$Port = 9101)

  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $listeners) {
    $pid = $conn.OwningProcess
    if (-not $pid) { continue }
    Write-BridgeLog "Stopping PID $pid listening on port $Port" 'WARN'
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  }

  if ($listeners) {
    Start-Sleep -Seconds 1
  }
}

function Stop-StaleBridgeNodes {
  Stop-BridgePortListeners -Port $(if ($env:PRINT_BRIDGE_PORT) { [int]$env:PRINT_BRIDGE_PORT } else { 9101 })

  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'server\.js' -and $_.CommandLine -match 'print-bridge' } |
    ForEach-Object {
      Write-BridgeLog "Stopping stale node PID $($_.ProcessId)" 'WARN'
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

  Start-Sleep -Milliseconds 500
}

function Start-BridgeNodeProcess {
  param([string]$NodeExe)

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $NodeExe
  $psi.Arguments = '"' + $ServerScript + '"'
  $psi.WorkingDirectory = $BridgeDir
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  foreach ($key in @('PRINTER_IP', 'PRINTER_PORT', 'PRINT_BRIDGE_HOST', 'PRINT_BRIDGE_PORT', 'BETTERSTACK_SOURCE_TOKEN', 'BETTERSTACK_INGESTING_HOST')) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if ($value) {
      $psi.EnvironmentVariables[$key] = $value
    }
  }

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  $null = $process.add_OutputDataReceived({ param($s, $e) if ($e.Data) { Write-BridgeLog $e.Data 'NODE' } })
  $null = $process.add_ErrorDataReceived({ param($s, $e) if ($e.Data) { Write-BridgeLog $e.Data 'NODE-ERR' } })

  if (-not $process.Start()) {
    throw 'Failed to start node process'
  }

  $process.BeginOutputReadLine()
  $process.BeginErrorReadLine()
  return $process
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Write-BridgeLog '========== BP RX Print Bridge starting =========='
Write-BridgeLog "Bridge directory: $BridgeDir"
Write-BridgeLog "Log file: $LogFile"
Write-BridgeLog "PowerShell: $($PSVersionTable.PSVersion)"
Write-BridgeLog "User: $env:USERDOMAIN\$env:USERNAME"
Write-BridgeLog "Computer: $env:COMPUTERNAME"

Import-BridgeEnvFile -Path $ConfigPath

if (-not (Test-Path $ServerScript)) {
  Write-BridgeLog "server.js not found at $ServerScript" 'ERROR'
  exit 1
}

$nodeExe = Resolve-NodeExe
if (-not $nodeExe) {
  Write-BridgeLog 'Node.js not found. Install Node.js LTS and re-run install-windows.bat' 'ERROR'
  exit 1
}

Write-BridgeLog "Node: $nodeExe"
Write-BridgeLog "Server script: $ServerScript"

$printerIp = if ($env:PRINTER_IP) { $env:PRINTER_IP } else { '172.18.129.123' }
$printerPort = if ($env:PRINTER_PORT) { $env:PRINTER_PORT } else { '9100' }
$bridgeHost = if ($env:PRINT_BRIDGE_HOST) { $env:PRINT_BRIDGE_HOST } else { '127.0.0.1' }
$bridgePort = if ($env:PRINT_BRIDGE_PORT) { $env:PRINT_BRIDGE_PORT } else { '9101' }

Write-BridgeLog ('Target printer: ' + $printerIp + ':' + $printerPort)
Write-BridgeLog ('Bridge listen: http://' + $bridgeHost + ':' + $bridgePort)

Set-Location $BridgeDir

Stop-StaleBridgeNodes

$run = 0
$exitCode = 0
while ($true) {
  $run += 1
  Write-BridgeLog "Launching node server.js (run #$run) ..."

  Stop-StaleBridgeNodes

  try {
    $process = Start-BridgeNodeProcess -NodeExe $nodeExe
    Write-BridgeLog "Node PID: $($process.Id)"
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    $level = if ($exitCode -eq 0) { 'WARN' } else { 'ERROR' }
    Write-BridgeLog "Node exited with code $exitCode" $level
  } catch {
    Write-BridgeLog "Bridge wrapper failed: $($_.Exception.Message)" 'ERROR'
    $exitCode = 1
  }

  Write-BridgeLog "Restarting bridge in $RestartDelaySec seconds ..." 'WARN'
  Start-Sleep -Seconds $RestartDelaySec
}
