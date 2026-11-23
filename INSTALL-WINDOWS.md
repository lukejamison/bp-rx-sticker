# BP RX Sticker — Windows install (simple)

OneScan workstation only. Do these in order.

> Already installed and just shipping a code update? See
> [`UPDATE_PROCEDURE.md`](./UPDATE_PROCEDURE.md) instead — this doc is for a
> brand-new workstation.

## Before you start

- [ ] Windows 10/11 PC on the pharmacy network
- [ ] [Node.js LTS](https://nodejs.org) installed (`node -v` works in cmd)
- [ ] [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) installed (or run `winget install Microsoft.DotNet.DesktopRuntime.8`)
- [ ] Google Chrome
- [ ] Latest release unzipped to `C:\bp-rx-sticker` — download `bp-rx-sticker-release.zip` from the
      [Releases page](https://github.com/lukejamison/bp-rx-sticker/releases/latest), right-click → Extract All
      (the folder must contain `extension` and `windows-monitor`)
- [ ] Zebra printer IP ready (e.g. `172.18.129.123`)

---

## 1. Install the print bridge

Right-click **Run as administrator**:

```bat
extension\print-bridge\install-windows.bat
```

Enter your **printer IP** when prompted (or pass it on the command line):

```bat
extension\print-bridge\install-windows.bat 172.18.129.123
```

**Check:** open in Chrome → http://127.0.0.1:9101/health  
Should show `"ok": true` and your printer IP.

---

## 2. Install the Chrome extension

1. Open Chrome → `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the **`extension`** folder inside this repo (not the repo root)
5. Pin **BP RX Sticker** to the toolbar

**Configure** (right-click extension → **Options**):

| Setting | Value |
|---------|--------|
| Listen for scans | ON |
| Mock print | **OFF** (for real labels) |
| Printer IP | Same as step 1 |
| Print bridge URL | `http://127.0.0.1:9101/print` |
| API URL | `http://172.18.129.154:3000` (or your server) |

Click **Save settings**, then:

1. **Check print bridge** → OK  
2. **Test network print** → label prints  
3. **Test API directly** → finds a known item  

---

## 3. Install the Windows monitor app

The release already contains the built app. In cmd (as Administrator), from `C:\bp-rx-sticker`:

```bat
cd windows-monitor
install-monitor.bat
```

(Cloning the repo instead of using the release? Run `build.bat` first; it needs the .NET 8 SDK.)

From now on the app updates itself: it offers **Install update** when a new release is published.

Accept the **UAC** prompt. Look for the tray icon near the clock (green / amber / red).

> **Note:** The monitor does not auto-restart after a bridge reset. If the tray icon disappears later, run:
> `Start-ScheduledTask -TaskName 'BP-RX-BridgeMonitor'`

Double-click the tray icon → confirm **Running as Administrator** and paths to bridge logs if needed → **Save paths**.

**Send logs test:** tray menu → **Send logs to IT**

---

## 4. Test on OneScan

1. Open https://onescan.lspedia.com/#/ssccScanIn
2. Extension popup → **Listening** should be ON
3. Scan a product from a **recent invoice**
4. Toast appears + **one label** prints

**Reprint:** extension popup → **Reprint label**

---

## Quick verify checklist

```
□ http://127.0.0.1:9101/health → ok
□ Extension loaded, mock print OFF
□ Test network print works
□ Tray monitor icon visible
□ OneScan scan → label prints
```

---

## If something breaks

| Problem | Fix |
|---------|-----|
| Bridge down | Task Scheduler → run `BP-RX-PrintBridge`, or tray → **Restart print bridge** |
| Monitor won't restart bridge | Re-launch monitor as Admin; run `install-monitor.bat` again |
| No label, lookup works | Mock print still ON? Printer IP wrong? |
| Not on recent invoice | Check lookup window (default **168h** / 7 days). Test API with `?hours=168` |
| Duplicate repo / bridge dies after prints | Run `extension\print-bridge\cleanup-windows.bat` (report), then `cleanup-windows.bat apply` |

**Logs:**

- Bridge: `extension\print-bridge\logs\`
- Monitor: `%AppData%\BpRxBridgeMonitor\monitor.log`
- Tray → **Send logs to IT**

---

## Uninstall

```bat
extension\print-bridge\install-windows.bat uninstall
cd windows-monitor
install-monitor.bat uninstall
```

Remove extension in `chrome://extensions`.

---

## Workstation cleanup (DELIVERY01)

Find duplicate `bp-rx-sticker` folders and orphan bridge processes:

```bat
extension\print-bridge\cleanup-windows.bat
extension\print-bridge\cleanup-windows.bat apply
```

Report-only by default. `apply` stops extra `node.exe` bridge PIDs — then restart the bridge from the tray or `install-windows.bat`.
