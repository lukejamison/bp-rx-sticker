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

This registers a Scheduled Task `BP-RX-PrintBridge` that:

- Starts at user logon
- Restarts up to 3 times if it crashes
- Runs `node extension/print-bridge/server.js`

Requires Node.js on PATH.

### Uninstall

```powershell
Unregister-ScheduledTask -TaskName 'BP-RX-PrintBridge' -Confirm:$false
```

## Environment

| Variable | Default |
|----------|---------|
| `PRINTER_IP` | `172.18.129.132` |
| `PRINTER_PORT` | `9100` |
| `PRINT_BRIDGE_PORT` | `9101` |
| `PRINT_BRIDGE_HOST` | `127.0.0.1` |

## Endpoints

- `GET /health` — bridge status
- `POST /print` — ZPL body; optional header `X-Printer-IP`
