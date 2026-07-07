# Print Bridge Troubleshooting & Incident History

This is the reference doc for "the print server went down again, what do I do
and why does this keep happening." It covers the system architecture, the two
root causes we found and fixed on 2026-07-06, the full toolkit of scripts, and
a step-by-step runbook for the next time something looks broken.

See [`CHANGELOG.md`](./CHANGELOG.md) for the terse version-by-version diff.

## How the pieces fit together

```
Chrome extension (background.js)
   │  scans a barcode via OneScan, looks up the item via API,
   │  builds ZPL, calls the local print bridge over HTTP
   ▼
Print bridge (server.js) — Node.js HTTP server on 127.0.0.1:9101
   │  queues print jobs, opens a raw TCP socket to the printer,
   │  writes ZPL bytes, closes the socket
   ▼
Zebra printer — raw TCP listener on port 9100 (default 172.18.129.123)
```

A third piece, the **Windows monitor tray app**
(`windows-monitor/BpRx.BridgeMonitor`), runs alongside the bridge as a
supervisor: it polls `/health`, shows a colored tray icon (green/amber/red),
can start/stop/restart the bridge's scheduled task, and can upload logs. It
does **not** sit in the print path — if it's not running, printing still
works, you just lose the health indicator and one-click restart.

Both the bridge and the monitor auto-start via **Windows Scheduled Tasks**:

| Task name | Runs | Registered by |
|---|---|---|
| `BP-RX-PrintBridge` | `start-bridge.ps1` → `node server.js` | `install-windows.bat` |
| `BP-RX-BridgeMonitor` | `BpRx.BridgeMonitor.exe` | `install-monitor.bat` |

## The two root causes found on 2026-07-06

We spent most of a day chasing "prints once, then the bridge is dead until I
restart" reports. It turned out to be **two separate, stacked bugs** — fixing
only one still left the other able to kill the bridge.

### 1. Printer TCP RST instead of FIN (fixed in `0.4.4`)

Zebra printers accept a raw TCP connection, read the ZPL bytes, print, and
expect the client to close cleanly. The old code called `client.destroy()`
without first calling `client.end()`. `destroy()` sends a TCP **RST**
(abortive close) instead of a **FIN** (graceful close). Zebra printers can be
sensitive to this and wedge their internal socket state — the *next*
connection attempt from the bridge gets refused or hangs, even though the
bridge process itself is still alive and `/health` looks fine.

**Fix:** always `client.end()`, drain any trailing bytes the printer sends
back (so an unread response buffer doesn't itself force a RST), and give the
socket up to 1.5s (`PRINTER_CLOSE_GRACE_MS`) to close gracefully before
force-destroying it as pure cleanup (after the print promise has already
resolved, so it can't block the request).

**Symptom this explains:** printer stops accepting jobs after 1–2 prints,
bridge health check still says OK, only a printer power-cycle or a long wait
fixes it.

### 2. EPIPE crash loop killing the whole process (fixed in `0.4.5`) — the big one

This is the one that actually explained "bridge is completely dead, has to
restart the computer." Found by reading a crash log with **99 identical
`uncaughtException: EPIPE: broken pipe, write` errors** firing within about
100 milliseconds, then total silence for 13 minutes until someone manually
restarted the bridge.

**The mechanism:**

1. `console.log()` writes to the process's stdout pipe.
2. Whatever was reading that pipe goes away — a closed PowerShell/terminal
   window, a scheduled task with no attached console, an RDP session ending,
   etc. This is *extremely* easy to trigger by accident just from normal use
   (opening/closing PowerShell windows to run diagnostics, restarting the
   bridge from a different terminal, etc).
3. The next `console.log()` call throws `EPIPE: broken pipe`.
4. Our own `uncaughtException` handler caught it — and called `log()` to
   report it, which called `console.log()` again.
5. That threw `EPIPE` again, straight back into `uncaughtException`.
6. **Node.js treats an exception thrown from inside the `uncaughtException`
   handler itself as unrecoverable and kills the process immediately** — it
   does not loop forever, it just terminates on the spot. (The 99 log lines
   in under 100ms were likely several already-queued/concurrent log calls all
   hitting the same broken pipe before the process actually died.)

This was reproduced directly: forcing `console.log` to throw and firing
`uncaughtException` against the pre-fix code crashes the whole Node process
instantly with a stack trace matching the field log exactly. Against the
fixed code, the error is swallowed, written to the file log only, and the
process keeps serving requests without interruption.

**Fix:** `log()` now wraps `console.log()` in try/catch. On first failure it
sets a `stdoutBroken` flag and never touches stdout again for the rest of the
process's life — file logging (`logs/server-YYYY-MM-DD.log`) keeps working
regardless, since that's the log you actually read anyway. Also attached a
`process.stdout.on('error', ...)` listener as a second layer of defense.

**Symptom this explains:** bridge "just dies" with no warning, `/health`
becomes totally unreachable (connection refused), nothing in the visible
terminal/task tray explains why, and only a full restart (or noticing the
process is gone and manually relaunching it) fixes it. Check
`logs/server-YYYY-MM-DD.log` for a burst of `uncaughtException` /`EPIPE`
lines followed by a large time gap before the next `listening` line — that
gap is the process being dead and nobody noticing yet.

### Other things fixed along the way

- **Printer IP inconsistency**: bridge, extension, and docs disagreed between
  `172.18.129.123` (canonical) and a legacy `172.18.129.132`. Standardized
  everywhere; the extension auto-migrates any stored legacy value. The bridge
  also now ignores the `X-Printer-IP` header from the extension entirely and
  always uses its own `PRINTER_IP` env var — there is now exactly one place
  that decides which printer to talk to.
- **Multi-label printing**: originally only ever printed 1 label per scan
  regardless of invoice quantity. `resolveLabelCount()` now reads
  `invoiceQty`/`receivedQty` off the scanned item (capped at 99) and
  `generateMultipleLabels()` repeats the ZPL that many times in a single print
  job, so a 10-unit line item correctly prints 10 labels.
- **Zombie Node processes holding port 9101**: an old bridge instance left
  running (e.g. after a crash that didn't fully exit, or a manual `node
  server.js` left in a background terminal) would hold the port and cause
  `EADDRINUSE`, so a freshly-started bridge process would silently fail to
  bind while `/health` still answered from the *stale* process running old
  code. `start-bridge.ps1` now force-kills anything on the bridge port before
  starting.
- **PowerShell script parsing errors**: some scripts had non-ASCII characters
  (em dashes `—`, arrows `→`) that PowerShell 5.1 on some Windows locales
  misdecodes, corrupting string literals and cascading into confusing parser
  errors (`Missing closing '}'`, `Unexpected token ')'`). All `.ps1` files in
  this folder are now ASCII-only.

## The script toolkit — what to run when

All paths relative to `extension/print-bridge/`.

| Script | Use when | What it does |
|---|---|---|
| `install-windows.ps1` / `.bat` | First-time setup on a new workstation, or to change the printer IP | Registers the `BP-RX-PrintBridge` scheduled task, writes `config.local.env`, starts the bridge |
| `start-bridge.ps1` | Rarely run directly — it's what the scheduled task calls | Kills anything already holding the bridge port, then launches `node server.js` with restart-on-crash logic |
| `reset-bridge.ps1` | Bridge seems stuck/unresponsive but you don't want a full reinstall | Force-kills all processes on the bridge port + any stray bridge Node processes, then restarts via `start-bridge.ps1` |
| `diagnose-print.ps1` | You're not sure *what's* wrong and want a full system snapshot | Checks scheduled task state, port listeners, `bridgeVersion` (flags if it doesn't match latest — usually means a zombie process running old code), printer reachability, and runs a live test print |
| `nuclear-reset.ps1` | `reset-bridge.ps1` didn't help, or you suspect the code itself is stale/corrupted | Full teardown: stops scheduled task, kills all bridge/monitor processes, pauses the tray monitor, archives old logs, `git pull`, rewrites `config.local.env`, re-registers the scheduled task, runs 3 live test prints, prints a PASS/FAIL summary. **Remember to relaunch the tray monitor manually afterward** — this script pauses it but doesn't restart it. |
| `test-one-print.ps1` | Quick manual sanity check of a single print | Sends one hardcoded ZPL label straight to the bridge's `/print` endpoint |
| `test-double-print.ps1` | Specifically testing the "works once, not twice" symptom | Sends two prints back-to-back with a pause between, to catch the printer-wedging (RST/FIN) class of bug |
| `cleanup-windows.ps1` | General housekeeping | Reports status of both scheduled tasks (`BP-RX-PrintBridge`, `BP-RX-BridgeMonitor`) |

## Runbook: "the bridge is down again"

1. **Check the tray icon color** (if the monitor app is running) — green =
   healthy, amber/red = something's wrong, no icon = monitor itself isn't
   running (see below).
2. **Check `/health` directly:**
   ```powershell
   Invoke-RestMethod http://127.0.0.1:9101/health
   ```
   - Connection refused → the bridge process is actually dead. Go to step 3.
   - Responds but `bridgeVersion` looks old/missing → a zombie process from a
     previous crash is squatting on the port. Run `reset-bridge.ps1`.
3. **Look at the log** for what actually happened right before it died:
   ```powershell
   Get-Content "extension\print-bridge\logs\server-$(Get-Date -Format yyyy-MM-dd).log" -Tail 100
   ```
   - A burst of `uncaughtException`/`EPIPE` lines followed by a long gap →
     this is the crash-loop bug from `0.4.5`. Confirm you're actually running
     `0.4.5`+ (`bridgeVersion` in `/health`); if not, `git pull` first.
   - `printer socket error` / timeouts around print time, health otherwise
     fine → likely the printer-side RST/FIN issue from `0.4.4`; confirm
     version, otherwise try `test-double-print.ps1` to reproduce.
4. **Restart it:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File extension\print-bridge\reset-bridge.ps1
   ```
5. **Still broken after a reset?** Escalate to the full reinstall:
   ```powershell
   powershell -ExecutionPolicy Bypass -File extension\print-bridge\nuclear-reset.ps1
   ```
   Then manually relaunch the tray monitor (see below) since nuclear-reset
   pauses it.
6. **If you changed anything and want a clean diagnostic snapshot** to
   compare against or share, run `diagnose-print.ps1` and save the output.

## Reopening the Windows monitor tray app

The monitor has no Desktop/Start Menu shortcut — the only auto-launch
mechanism is the `BP-RX-BridgeMonitor` scheduled task, which runs at logon.

- **Fastest**: check the hidden icons area of the system tray (the `^` arrow
  next to the clock) — it may already be running.
- **Restart the scheduled task:**
  ```powershell
  Start-ScheduledTask -TaskName 'BP-RX-BridgeMonitor'
  ```
- **Run the exe directly** (as Administrator — it needs elevation for
  scheduled-task/process control):
  `windows-monitor\publish\BpRx.BridgeMonitor.exe`
- **Reinstall from scratch** if the task itself is missing:
  ```bat
  cd windows-monitor
  build.bat
  install-monitor.bat
  ```

As of 2026-07-06 the app has a proper icon (printer + sticker label, green
health-dot accent) instead of the default .NET icon — visible on the `.exe`
itself and in the "Open status" window title bar/taskbar entry. The live tray
icon color (green/amber/red/gray) is unchanged and still reflects bridge
health dynamically.
