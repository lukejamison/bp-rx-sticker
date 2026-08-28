# BP RX Sticker

Price sticker printing for PioneerRx **OneScan** receiving workstations.

**Primary path (production):** Chrome extension + local print bridge → Zebra printer on the LAN.

**Legacy path (archived, code retained):** Next.js PWA for Zebra T56 handhelds — see [`docs/LEGACY-PWA.md`](./docs/LEGACY-PWA.md).

---

## How it works

```
OneScan (Chrome)  →  BP RX extension  →  Invoice API (172.18.129.154)
                              ↓
                     Print bridge :9101  →  Zebra printer :9100
```

| Component | Location | Purpose |
|-----------|----------|---------|
| Chrome extension | `extension/` | Scan detection, API lookup, ZPL generation |
| Print bridge | `extension/print-bridge/` | HTTP → raw TCP to printer |
| Bridge monitor (optional) | `windows-monitor/` | Tray icon, health, restart bridge |
| Invoice API | `~/prx-api` on Linux server | Lookup + completion tracking |
| n8n workflow | `n8n/` | PioneerRx → Postgres invoice sync |

---

## Workstation setup (Windows)

**New machine:** follow [`INSTALL-WINDOWS.md`](./INSTALL-WINDOWS.md) step by step.

**Already installed — shipping a code update:** follow [`UPDATE_PROCEDURE.md`](./UPDATE_PROCEDURE.md).

Quick health checks:

```powershell
Invoke-RestMethod http://127.0.0.1:9101/health
Get-ScheduledTask -TaskName 'BP-RX-PrintBridge','BP-RX-BridgeMonitor'
```

---

## Repo layout

```
bp-rx-sticker/
├── extension/              # Chrome extension (main product)
│   └── print-bridge/       # Node print server + Windows install scripts
├── windows-monitor/        # Optional tray monitor app
├── api-endpoints/          # Snippets to merge into ~/prx-api/server.js
├── migrations/             # Postgres migrations
├── n8n/                    # Invoice Detail workflow exports
├── help_docs/              # PioneerRx / API system reference
├── docs/                   # Consolidated guides
└── app/                    # Legacy T56 PWA (not actively deployed)
```

---

## Operations & troubleshooting

| Topic | Doc |
|-------|-----|
| Windows install | [`INSTALL-WINDOWS.md`](./INSTALL-WINDOWS.md) |
| Rolling out updates | [`UPDATE_PROCEDURE.md`](./UPDATE_PROCEDURE.md) |
| Print bridge issues | [`extension/print-bridge/TROUBLESHOOTING.md`](./extension/print-bridge/TROUBLESHOOTING.md) |
| API / database debugging | [`docs/API-TROUBLESHOOTING.md`](./docs/API-TROUBLESHOOTING.md) |
| System architecture | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Invoice pipeline reference | [`help_docs/PRX_INVOICE_SYSTEM_DOCUMENTATION.md`](./help_docs/PRX_INVOICE_SYSTEM_DOCUMENTATION.md) |
| Better Stack telemetry | Source `2587655` (`bp-rx-sticker`) — extension logs print/lookup events |

---

## Monitoring (Better Stack)

The Chrome extension sends `INFO`/`WARN` events (prints, lookup failures, bulk-scan guards) to Better Stack when configured in extension **Options → Alerting**.

The print bridge can also log to the same source via `BETTERSTACK_SOURCE_TOKEN` in `extension/print-bridge/config.local.env`.

---

## API server

The live API runs separately at `172.18.129.154:3000` (`~/prx-api/server.js`, systemd `prx-api`). Changes in `api-endpoints/` must be merged there and the service restarted:

```bash
ssh luke@172.18.129.154
sudo systemctl restart prx-api
```

---

## Contact

Luke (CTO) — Bushard's Pharmacy
