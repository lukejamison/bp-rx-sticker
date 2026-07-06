# BP RX Print Bridge

Local HTTP server that forwards ZPL from the Chrome extension to a Zebra printer on port 9100.

## Quick start (manual)

```bash
node extension/print-bridge/server.js
```

Verify: http://127.0.0.1:9101/health

## Windows auto-start (production)

Run **as Administrator** on the OneScan workstation:

```bat
extension\print-bridge\install-windows.bat
```

With a specific printer IP (skips IP prompt):

```bat
extension\print-bridge\install-windows.bat 172.18.129.200
```

Uninstall scheduled task:

```bat
extension\print-bridge\install-windows.bat uninstall
```

This registers scheduled task `BP-RX-PrintBridge` that:

- Starts at user logon via `start-bridge.ps1`
- Loads `config.local.env` (printer IP, ports)
- Logs to `extension/print-bridge/logs/bridge-YYYY-MM-DD.log`
- Restarts up to 3 times if it crashes (1 minute apart)

Requires Node.js on PATH.

### Change printer IP later

1. Re-run `install-windows.bat` (interactive or pass IP), **or**
2. Edit `config.local.env`, then restart the task:

```powershell
Restart-ScheduledTask -TaskName 'BP-RX-PrintBridge'
```

### Logs

| File | Contents |
|------|----------|
| `logs/install-*.log` | Installer steps, task registration, health probe |
| `logs/bridge-YYYY-MM-DD.log` | Bridge wrapper + Node stdout/stderr |

### Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File extension/print-bridge/install-windows.ps1 -Uninstall
```

## Environment

Set in `config.local.env` (preferred on Windows) or shell env for manual runs:

| Variable | Default |
|----------|---------|
| `PRINTER_IP` | `172.18.129.132` |
| `PRINTER_PORT` | `9100` |
| `PRINT_BRIDGE_PORT` | `9101` |
| `PRINT_BRIDGE_HOST` | `127.0.0.1` |

Copy `config.local.env.example` → `config.local.env` if installing manually.

## Endpoints

- `GET /health` — bridge status
- `POST /print` — ZPL body; optional header `X-Printer-IP`

## Future: Windows monitor app

Tray app for health, restart, and log upload: [`windows-monitor/README.md`](../../windows-monitor/README.md)
