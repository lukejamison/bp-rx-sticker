# Update procedure — extension + print bridge

How to ship a code change to a **OneScan workstation that is already installed**.

For a brand-new PC, use [`INSTALL-WINDOWS.md`](./INSTALL-WINDOWS.md) instead.

---

## What you're updating

| Component | Version location | Verify live |
|-----------|------------------|-------------|
| Chrome extension | `extension/manifest.json` → `"version"` | `chrome://extensions` card |
| Print bridge | `BRIDGE_VERSION` in `extension/print-bridge/server.js` | `http://127.0.0.1:9101/health` → `bridgeVersion` |
| Bridge monitor | Rebuild only when `windows-monitor/` changed | Tray icon near clock |

Bump the version whenever you change that component's code. For bridge changes, also update the version string in `diagnose-print.ps1` and add a line to `extension/print-bridge/CHANGELOG.md`.

---

## Before you push

1. Make changes on your dev machine (not directly on the workstation).
2. Bump version number(s).
3. `node --check extension/print-bridge/server.js`
4. Commit and push to GitHub.

---

## On the workstation

### Step 1 — Get new code

```powershell
cd C:\bp-rx-sticker   # or your actual repo path
git pull
```

If git isn't available, copy only the files that changed (check `git log --stat`).

### Step 2 — Chrome extension

1. `chrome://extensions`
2. Reload **BP RX Sticker**
3. **Refresh every open OneScan tab** (content scripts don't hot-reload)
4. Confirm version matches what you shipped

Typical hot paths:

| Files | When |
|-------|------|
| `extension/lib/zpl.js` | Label layout |
| `extension/content/onescan.js` | Scan detection |
| `extension/background.js`, `extension/lib/api.js` | Lookup / completion |
| `extension/manifest.json` | Version, permissions |

### Step 3 — Print bridge (only if `extension/print-bridge/` changed)

```powershell
powershell -ExecutionPolicy Bypass -File extension\print-bridge\reset-bridge.ps1
```

If unhealthy, see [`extension/print-bridge/TROUBLESHOOTING.md`](./extension/print-bridge/TROUBLESHOOTING.md).

Config-only change (e.g. Better Stack token in `config.local.env`):

```powershell
Restart-ScheduledTask -TaskName 'BP-RX-PrintBridge'
```

### Step 4 — Bridge monitor (rare)

Only when `windows-monitor/` changed:

```powershell
cd windows-monitor
build.bat
install-monitor.bat
```

**After any bridge reset:** the monitor does **not** auto-restart. If the tray icon is missing:

```powershell
Start-ScheduledTask -TaskName 'BP-RX-BridgeMonitor'
```

### Step 5 — API server (only if `api-endpoints/` changed)

On the Linux server — **not** on the Windows PC:

```bash
ssh luke@172.18.129.154
cd ~/prx-api
# merge changes from api-endpoints/ into server.js
sudo systemctl restart prx-api
```

---

## Verify

```powershell
extension\print-bridge\diagnose-print.ps1
```

Checklist:

- [ ] `http://127.0.0.1:9101/health` → `bridgeVersion` matches
- [ ] `chrome://extensions` → extension version matches
- [ ] Scan a real product on OneScan → correct label prints once
- [ ] Tray monitor icon visible (if installed)
- [ ] Better Stack dashboard shows recent events (if alerting configured)

---

## Rollback

```powershell
git checkout <previous-commit> -- extension/
# reload extension at chrome://extensions

git checkout <previous-commit> -- extension/print-bridge/server.js
extension\print-bridge\reset-bridge.ps1
```

`config.local.env` is not in git — rollback never touches printer IP or Better Stack tokens.

---

## Multi-workstation rollout

Update **one PC first**, verify through a real shift, then repeat on the rest. Track which machine is on which version.

---

## What does **not** need updating

| Change | Workstation action |
|--------|-------------------|
| Label layout only | Extension reload |
| Scan logic only | Extension reload |
| Bridge stability fix | `reset-bridge.ps1` |
| API field added | Linux server only |
| n8n workflow | n8n UI only |
| Legacy `app/` PWA | Not used on OneScan PCs |
