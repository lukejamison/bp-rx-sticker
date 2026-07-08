# Update procedure — Chrome extension + print bridge

How to safely ship a code change to a scan workstation that's **already
installed** (see [`INSTALL-WINDOWS.md`](./INSTALL-WINDOWS.md) for a fresh
install instead). Covers `extension/` (Chrome extension) and
`extension/print-bridge/` (Node print bridge) only — the two components that
change most often.

## Versioning convention

Two independent version numbers, both bumped whenever their code changes:

| Component | Where the version lives | How to check it live |
|---|---|---|
| Chrome extension | `extension/manifest.json` → `"version"` | `chrome://extensions` card |
| Print bridge | `BRIDGE_VERSION` const in `extension/print-bridge/server.js` | `GET http://127.0.0.1:9101/health` → `bridgeVersion` |

Whenever you change `server.js`, also bump `BRIDGE_VERSION` **and** the
version check in `diagnose-print.ps1` (`$health.bridgeVersion -ne '...'`) to
match — otherwise the diagnostic script will report a false "stale bridge"
warning forever. Add an entry to
[`extension/print-bridge/CHANGELOG.md`](./extension/print-bridge/CHANGELOG.md)
for any bridge change, even a small one — it's the fastest way to answer
"did this workstation actually get the fix?" during an incident.

## Before rolling out

1. Make the code change in this repo (wherever you're developing — not
   directly on the workstation).
2. Bump version number(s) per the table above.
3. `node --check extension/print-bridge/server.js` (or open in an editor with
   linting) — catches syntax errors before they reach a machine printing live
   labels.
4. If you have a local Node install, run `node extension/print-bridge/server.js`
   manually and hit `http://127.0.0.1:9101/health` to sanity-check before
   shipping to a workstation.
5. Commit and push.

## Rolling out to a workstation

### Step 1 — get the new code onto the machine

**Preferred: `git pull`** (if the workstation's copy is a real git clone with
no local edits):

```powershell
cd C:\bp-rx-sticker   # or wherever this repo lives on that PC
git pull
```

**Fallback: manual file copy** (if the workstation's copy isn't a clean git
clone, or git isn't installed there). Only copy files that actually changed —
check `git log --stat` or the CHANGELOG for the specific paths. Typical hot
paths:

| File(s) | When you'd touch them |
|---|---|
| `extension/lib/zpl.js` | Label layout/formatting changes |
| `extension/lib/api.js`, `extension/background.js` | API/lookup/completion-tracking logic |
| `extension/content/onescan.js`, `content/shared.js` | Scan detection / OneScan page behavior |
| `extension/manifest.json` | Version bump, permissions |
| `extension/print-bridge/server.js` | Bridge stability/behavior changes |
| `extension/print-bridge/*.ps1` | Install/diagnostic script changes |

### Step 2 — apply the update per component

**Chrome extension** (any file under `extension/` except `print-bridge/`):

1. `chrome://extensions`
2. Click the reload icon (↻) on the **BP RX Sticker** card
3. Refresh any open OneScan tab (extension content scripts don't hot-reload
   into already-open pages)
4. Confirm the version number shown on the card matches what you expect

**Print bridge** (`extension/print-bridge/server.js` or its `.ps1` scripts
changed):

```powershell
extension\print-bridge\reset-bridge.ps1
```

This force-kills any stale process on the bridge port and restarts cleanly
under the scheduled task. If that doesn't come back healthy, escalate to
`nuclear-reset.ps1` (see [`TROUBLESHOOTING.md`](./extension/print-bridge/TROUBLESHOOTING.md)).

If only `config.local.env` changed (e.g. adding Better Stack credentials, no
code change), a plain restart is enough:

```powershell
Restart-ScheduledTask -TaskName 'BP-RX-PrintBridge'
```

**Windows monitor app** (rare — only if `windows-monitor/` changed):

```powershell
cd windows-monitor
build.bat
install-monitor.bat
```

### Step 3 — verify

```powershell
extension\print-bridge\diagnose-print.ps1
```

This reports scheduled task state, port listener, live `bridgeVersion` vs.
expected, printer reachability, and does a live test print. Also manually
confirm:

- [ ] `http://127.0.0.1:9101/health` → `bridgeVersion` matches what you just shipped
- [ ] `chrome://extensions` → extension version matches what you just shipped
- [ ] Scan a real product on OneScan → correct label count prints, exactly once
- [ ] No new warnings in `extension/print-bridge/logs/server-*.log` or the
      Better Stack dashboard (if configured — see below)

### Step 4 — rollback if something's wrong

- **Extension:** `git checkout <previous-commit> -- extension/`, reload at
  `chrome://extensions`
- **Print bridge:** `git checkout <previous-commit> -- extension/print-bridge/server.js`,
  then `reset-bridge.ps1`

Since `config.local.env` isn't tracked in git (it's workstation-specific), a
`git checkout` on the bridge never touches printer IP / Better Stack config —
only code.

## Multiple workstations

If more than one PC runs this (e.g. `DELIVERY01` plus others), roll out to
one workstation first, run the full verification checklist above, watch it
print for a real shift if possible, *then* repeat on the rest. Track which
workstation is on which version somewhere durable (this repo's
[Notion doc](https://app.notion.com/p/38e2bc22f56f80279db6c3e6c788eee9) is
the current source of truth) so a future incident report like "it's broken on
the delivery PC" can be immediately cross-checked against whether that PC
actually has the fix yet.

## Monitoring after rollout

If Better Stack alerting is configured (see
[`extension/print-bridge/README.md`](./extension/print-bridge/README.md#better-stack-alerting-optional)
and the extension's Options page → **Alerting**), you'll get a real-time
alert for print bridge crashes/errors and extension-side print/lookup
failures without needing to check logs manually. Restarting the bridge after
an update always emits one `INFO` "print bridge started" event — a quick way
to confirm the update reached the workstation and the bridge came back up
cleanly.
