# Print Bridge Changelog

Version history for the Node print bridge (`server.js`), the Chrome extension pieces
that talk to it, and the Windows monitor tray app. See
[`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) for the full story behind the `0.4.x`
fixes — this file is just the terse "what changed" log.

Bridge version shown here matches `BRIDGE_VERSION` in `server.js` and the response
from `GET /health`.

## [0.4.5] - 2026-07-06

### Fixed — CRITICAL: bridge process crash on broken stdout pipe (EPIPE)

- Root cause: `console.log()` throws `EPIPE` when whatever was reading the
  process's stdout goes away (closed terminal window, a scheduled task with no
  attached console, etc). Our `uncaughtException` handler called `log()` to
  report the error, which called `console.log()` again, which threw `EPIPE`
  again. **Node treats an exception thrown from inside `uncaughtException`
  itself as fatal and kills the whole process instantly** — no restart, no
  further logging, just gone.
- This was almost certainly the dominant cause of "prints once then the bridge
  is dead until I restart the computer" reports.
- Fix: `log()` now catches any `console.log()` failure, sets a `stdoutBroken`
  flag, and never touches stdout again for the rest of the process's life.
  File logging (`logs/server-YYYY-MM-DD.log`) is unaffected. Also listens for
  `process.stdout.on('error', ...)` as a belt-and-suspenders guard.
- Verified by directly forcing `console.log` to throw against the old vs. new
  code: old code crashes the process immediately with a stack trace matching
  the field-reported crash log; new code logs to file and keeps serving
  requests.

## [0.4.4] - 2026-07-06

### Fixed — printer TCP connection handling (RST vs FIN)

- `sendZplToPrinter` was calling `client.destroy()` without a preceding
  `client.end()`, which sends a TCP RST instead of a clean FIN. Zebra printers
  are sensitive to abortive closes and can wedge their internal socket state,
  refusing the *next* connection attempt until power-cycled or until enough
  time passes.
- Fix: `client.end()` for a graceful close, drain any trailing data from the
  printer with a no-op `data` listener (so an unread response doesn't itself
  trigger a RST), resolve the print promise on `close` or after a
  `PRINTER_CLOSE_GRACE_MS` (1.5s) timeout, and only `destroy()` as a cleanup
  step *after* the promise has already settled.
- Dynamic scaling of `httpTimeoutForZpl` / `printTimeoutsForZpl` based on ZPL
  payload size, so large multi-label jobs don't spuriously time out.
- Bridge now ignores the `X-Printer-IP` request header entirely and always
  uses its own configured `PRINTER_IP` — prevents the extension and bridge
  from ever disagreeing about which printer to use.

## [0.4.3] - 2026-07-06

- Added request-scoped timers (`createRequestTimer`) so an HTTP request can't
  hang indefinitely on body read or print execution.
- Added `respondJson` helper to avoid writing to a response whose client
  already disconnected.
- More structured logging: request IDs, byte counts, label counts, per-stage
  timing.

## [0.4.2] - 2026-07-06

- `PRINTER_IP` is now read from `process.env.PRINTER_IP` (set via
  `config.local.env`) with fallback to the default. `bridgeVersion` and
  `printerIp` included in `/health` response for diagnostics.

## [0.4.1] - 2026-07-06

### Changed — printer IP standardized to `172.18.129.123`

- The bridge, extension defaults, options page, and all install/diagnostic
  scripts previously disagreed on the printer's IP (`.123` in some places,
  legacy `.132` in others). Standardized everywhere on `172.18.129.123`.
- `extension/options/options.js` auto-migrates any stored `.132` value to
  `.123` on load, so existing installs self-heal without user action.

## [0.4.0] and earlier

- Introduced multi-label printing: `resolveLabelCount()` reads
  `invoiceQty`/`receivedQty` from the scanned item (capped at 99) and
  `generateMultipleLabels()` repeats the ZPL that many times in one print job,
  so a 10-unit line item prints 10 labels instead of 1.
- Added "Reprint last label" support in the popup, using the same
  `labelCount` from the original scan.
- Introduced the print job queue (`enqueuePrint`) so concurrent print requests
  are serialized instead of racing on the same TCP socket.

## Windows monitor app (`windows-monitor/`)

Tracked separately from the bridge version (`BpRx.BridgeMonitor.csproj`
`<Version>`, currently `0.1.0`).

- **2026-07-06**: Added a proper application icon (`app.ico`) — printer +
  peeling sticker label with a green health-dot accent, matching the tray
  icon's color language. Wired up via `<ApplicationIcon>` in the `.csproj`
  and applied to `StatusForm` so the "Open status" window matches too. The
  live tray icon itself (`TrayIconFactory.cs`) is intentionally left as a
  dynamically-colored dot (green/amber/red/gray) reflecting bridge health —
  that behavior is unchanged.
