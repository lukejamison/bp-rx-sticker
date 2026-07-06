# BP RX Sticker — Windows install (simple)

OneScan workstation only. Do these in order.

## Before you start

- [ ] Windows 10/11 PC on the pharmacy network
- [ ] [Node.js LTS](https://nodejs.org) installed (`node -v` works in cmd)
- [ ] [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) installed (`dotnet -v` works) — needed to build the monitor app
- [ ] Google Chrome
- [ ] This repo copied to the PC (e.g. `C:\bp-rx-sticker`)
- [ ] Zebra printer IP ready (e.g. `172.18.129.132`)

---

## 1. Install the print bridge

Right-click **Run as administrator**:

```bat
extension\print-bridge\install-windows.bat
```

Enter your **printer IP** when prompted (or pass it on the command line):

```bat
extension\print-bridge\install-windows.bat 172.18.129.132
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

## 3. Build & install the Windows monitor app

In cmd (as Administrator), from the repo root:

```bat
cd windows-monitor
build.bat
install-monitor.bat
```

Accept the **UAC** prompt. Look for the tray icon near the clock (green / amber / red).

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
| Not on recent invoice | Invoice must be in last 24h (72h Sun/Mon) |

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
