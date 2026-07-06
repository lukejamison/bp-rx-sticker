# BP RX Bridge Monitor (Windows)

Native **system tray app** for OneScan workstations. Shows print bridge + printer health, restarts the bridge task, and **sends logs to IT** via webhook.

Runs as **Administrator** (UAC on launch) so Start / Stop / Restart on `BP-RX-PrintBridge` always works for debugging.

Separate from `extension/` — build and run on Windows only (.NET 8).

## What it does

| Feature | Description |
|---------|-------------|
| **Tray icon** | Green / amber / red from bridge + printer + scheduled task state |
| **Status window** | Bridge HTTP health, printer TCP probe, task state + last run/result |
| **Start / Stop / Restart bridge** | Controls `BP-RX-PrintBridge` scheduled task (requires Admin) |
| **Send logs** | POSTs health snapshot + log files to n8n webhook |
| **Open log folder** | Bridge install/bridge logs + local monitor log |

## Requirements

- Windows 10/11
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) (to build) or [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (to run published build)
- Print bridge installed (`extension/print-bridge/install-windows.bat`)
- **Administrator** — UAC prompt when launching (required for task restart)
- Outbound HTTPS to `n8n.bushardspharmacy.com` for log upload

## Build (on Windows)

```bat
cd windows-monitor
build.bat
```

Output: `windows-monitor/publish/BpRx.BridgeMonitor.exe`

## Install (recommended — auto-start at logon, elevated)

Run **as Administrator** after `build.bat`:

```bat
cd windows-monitor
install-monitor.bat
```

Registers scheduled task `BP-RX-BridgeMonitor` with **RunLevel: Highest** (Administrator). Uninstall:

```bat
install-monitor.bat uninstall
```

## Run manually

1. Right-click `publish\BpRx.BridgeMonitor.exe` → **Run as administrator**  
   (or double-click — UAC prompt appears because of app manifest)
2. Tray icon appears near the clock
3. Double-click tray → **Open status**

Set paths if auto-detect fails:

- **Bridge log folder** — e.g. `...\extension\print-bridge\logs`
- **Bridge config** — e.g. `...\extension\print-bridge\config.local.env`

Click **Save paths**.

## Administrator / debug controls

The app manifest requests `requireAdministrator`. The status window shows:

- **Running as Administrator** — Start / Stop / Restart enabled
- **Not elevated** — controls may fail (should not happen if UAC was accepted)

Tray menu debug actions:

- **Start print bridge**
- **Stop print bridge**
- **Restart print bridge**

These run PowerShell against the `BP-RX-PrintBridge` task installed by `extension/print-bridge/install-windows.bat`.

## Send logs to IT

Tray menu → **Send logs to IT**, or use the button in the status window.

**Webhook (default):** `https://n8n.bushardspharmacy.com/webhook/bp-sticker-logs`

Payload includes elevation status, task last result/run time, logs, and config.

## Full workstation setup (tomorrow checklist)

```bat
REM 1. Print bridge (Admin)
extension\print-bridge\install-windows.bat YOUR_PRINTER_IP

REM 2. Build + install monitor (Admin)
cd windows-monitor
build.bat
install-monitor.bat

REM 3. Chrome: load unpacked extension from extension\
REM 4. Extension Options: mock print OFF, printer IP set
REM 5. OneScan → SSCC Scan In → scan
```

## Related

- Print bridge: `extension/print-bridge/README.md`
- Planning notes: `extension/print-bridge/WINDOWS_MONITOR_APP.md`
- Chrome extension: `extension/`
