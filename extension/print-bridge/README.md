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
| `PRINTER_IP` | `172.18.129.123` |
| `PRINTER_PORT` | `9100` |
| `PRINT_BRIDGE_PORT` | `9101` |
| `PRINT_BRIDGE_HOST` | `127.0.0.1` |
| `BETTERSTACK_SOURCE_TOKEN` | *(blank = disabled)* |
| `BETTERSTACK_INGESTING_HOST` | *(blank = disabled)* |

Copy `config.local.env.example` → `config.local.env` if installing manually.

### Better Stack alerting (optional)

Set `BETTERSTACK_SOURCE_TOKEN` and `BETTERSTACK_INGESTING_HOST` (both from your
Better Stack source's **Configure** page) in `config.local.env`, then restart
the task:

```powershell
Restart-ScheduledTask -TaskName 'BP-RX-PrintBridge'
```

Every `WARN`/`ERROR` the bridge logs (printer errors, timeouts, crashes) is
also sent to Better Stack in real time, plus one `INFO` "print bridge started"
event on every startup — a quick way to confirm it's wired up correctly by
restarting the task and watching for that line in the Better Stack dashboard.
Leave both variables blank to disable; nothing else about the bridge changes.

## Endpoints

- `GET /health` — bridge status
- `POST /print` — ZPL body; optional header `X-Printer-IP`

## Windows monitor app

Tray app for health, restart, and log upload: [`windows-monitor/README.md`](../../windows-monitor/README.md)

## Something broken?

- [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) — architecture overview, root
  causes of past incidents (printer TCP RST/FIN wedging, the EPIPE crash-loop
  bug), the full script toolkit, and a step-by-step runbook.
- [`CHANGELOG.md`](./CHANGELOG.md) — version-by-version history of the bridge.

## Shipping a code change?

See [`UPDATE_PROCEDURE.md`](../../UPDATE_PROCEDURE.md) at the repo root —
versioning convention, rollout steps, verification checklist, and rollback.
