# BP RX Print Bridge — process wrapper (used by Windows Scheduled Task)
# Loads config.local.env, logs to logs/, runs server.js

$ErrorActionPreference = 'Continue'

$BridgeDir = $PSScriptRoot
$LogDir = Join-Path $BridgeDir 'logs'
$ConfigPath = Join-Path $BridgeDir 'config.local.env'
$ServerScript = Join-Path $BridgeDir 'server.js'
$LogFile = Join-Path $LogDir ("bridge-{0:yyyy-MM-dd}.log" -f (Get-Date))

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
    Write-BridgeLog "  $key=$value"
  }
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

$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
  Write-BridgeLog 'Node.js not found on PATH. Install Node.js LTS and re-run install.' 'ERROR'
  exit 1
}

Write-BridgeLog "Node: $nodeExe"
Write-BridgeLog "Server script: $ServerScript"

$printerIp = if ($env:PRINTER_IP) { $env:PRINTER_IP } else { '172.18.129.132' }
$printerPort = if ($env:PRINTER_PORT) { $env:PRINTER_PORT } else { '9100' }
$bridgeHost = if ($env:PRINT_BRIDGE_HOST) { $env:PRINT_BRIDGE_HOST } else { '127.0.0.1' }
$bridgePort = if ($env:PRINT_BRIDGE_PORT) { $env:PRINT_BRIDGE_PORT } else { '9101' }

Write-BridgeLog "Target printer: $($printerIp):$($printerPort)"
Write-BridgeLog "Bridge listen: http://$($bridgeHost):$($bridgePort)"

Set-Location $BridgeDir

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $nodeExe
$psi.Arguments = "`"$ServerScript`""
$psi.WorkingDirectory = $BridgeDir
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true

foreach ($key in @('PRINTER_IP', 'PRINTER_PORT', 'PRINT_BRIDGE_HOST', 'PRINT_BRIDGE_PORT')) {
  $value = [Environment]::GetEnvironmentVariable($key)
  if ($value) {
    $psi.EnvironmentVariables[$key] = $value
  }
}

try {
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  $null = $process.add_OutputDataReceived({ param($s, $e) if ($e.Data) { Write-BridgeLog $e.Data 'NODE' } })
  $null = $process.add_ErrorDataReceived({ param($s, $e) if ($e.Data) { Write-BridgeLog $e.Data 'NODE-ERR' } })

  Write-BridgeLog 'Launching node server.js ...'
  if (-not $process.Start()) {
    Write-BridgeLog 'Failed to start node process' 'ERROR'
    exit 1
  }

  $process.BeginOutputReadLine()
  $process.BeginErrorReadLine()

  Write-BridgeLog "Node PID: $($process.Id)"
  $process.WaitForExit()
  $exitCode = $process.ExitCode
  Write-BridgeLog "Node exited with code $exitCode" $(if ($exitCode -eq 0) { 'INFO' } else { 'ERROR' })
  exit $exitCode
} catch {
  Write-BridgeLog "Bridge wrapper failed: $($_.Exception.Message)" 'ERROR'
  exit 1
} finally {
  Write-BridgeLog '========== BP RX Print Bridge stopped =========='
}
