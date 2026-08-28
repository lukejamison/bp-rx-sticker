# Architecture

## Production system (OneScan + Chrome extension)

```
┌─────────────────────────────────────────────────────────────────┐
│  Windows workstation (OneScan receiving PC)                     │
│                                                                 │
│  ┌──────────────┐    ┌─────────────────┐    ┌───────────────┐  │
│  │ OneScan      │    │ BP RX Chrome    │    │ Print bridge  │  │
│  │ (PioneerRx)  │───▶│ extension       │───▶│ Node :9101    │──┼──▶ Zebra printer
│  │ in Chrome    │    │ scan + ZPL      │    │ (scheduled    │  │    (LAN :9100)
│  └──────────────┘    └────────┬────────┘    │  task)        │  │
│                               │              └───────────────┘  │
│  ┌──────────────┐             │                                 │
│  │ Bridge       │─────────────┘ polls /health                    │
│  │ Monitor tray │  (optional — restart, send logs)              │
│  └──────────────┘                                               │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP (LAN)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Linux API server — 172.18.129.154:3000                         │
│  ~/prx-api/server.js (systemd: prx-api)                         │
│  PostgreSQL — prx_invoices, prx_invoices_completed              │
└───────────────────────────────┬─────────────────────────────────┘
                                ▲
                                │ webhook
┌───────────────────────────────┴─────────────────────────────────┐
│  n8n — PRX Invoice Detail workflow                            │
│  PioneerRx ActiveReport → Postgres upsert                       │
└─────────────────────────────────────────────────────────────────┘
```

## Scan → print flow

1. Staff scans a barcode on the OneScan **SSCC Scan In** page.
2. Extension content script (`extension/content/onescan.js`) detects the scan from the barcode input field (and guards against duplicate DOM events).
3. Background worker (`extension/background.js`) parses GS1 data, calls the API with UPC/NDC candidates.
4. On success, `extension/lib/zpl.js` builds ZPL; background POSTs to `http://127.0.0.1:9101/print`.
5. Print bridge (`extension/print-bridge/server.js`) queues the job and sends raw ZPL to the printer via TCP :9100.
6. Extension marks the invoice line item completed via `POST /api/completed`.

## Components

| Piece | Technology | Runs where |
|-------|------------|------------|
| Extension | Chrome MV3 | OneScan PC |
| Print bridge | Node.js | OneScan PC (scheduled task) |
| Bridge monitor | .NET 8 WinForms | OneScan PC (optional tray app) |
| API | Node.js + Express | Linux server |
| Database | PostgreSQL | Linux server |
| Invoice sync | n8n workflow | n8n host |

## Telemetry

Better Stack source **2587655** (`bp-rx-sticker`):

- Extension → Options page Better Stack token (prints, lookup failures, scan guards)
- Print bridge → `config.local.env` tokens (bridge WARN/ERROR, startup ping)

## Legacy path (not production)

The `app/` Next.js PWA targeted Zebra T56 handhelds with Browser Print over Bluetooth. Code is retained; see [`docs/LEGACY-PWA.md`](./docs/LEGACY-PWA.md).

## Network requirements

| From | To | Port |
|------|-----|------|
| Workstation | API server | 3000 |
| Workstation | Zebra printer | 9100 |
| Extension | Print bridge | 9101 (localhost) |
| PioneerRx | n8n webhook | 443/5678 (n8n host) |

All pharmacy workstations and the API server must be on the same LAN (or routed network).

## Related docs

- [`INSTALL-WINDOWS.md`](./INSTALL-WINDOWS.md) — workstation setup
- [`UPDATE_PROCEDURE.md`](./UPDATE_PROCEDURE.md) — shipping code changes
- [`help_docs/PRX_INVOICE_SYSTEM_DOCUMENTATION.md`](./help_docs/PRX_INVOICE_SYSTEM_DOCUMENTATION.md) — API + database reference
