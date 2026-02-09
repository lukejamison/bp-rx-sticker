# Zebra Browser Print Troubleshooting

## Quick Check

Open your app and click "🔧 Diagnostics" button to see:
- ✓ BrowserPrint SDK loaded
- ✓ Number of printers found
- Detailed error messages

## Common Issues

### 1. "BrowserPrint SDK not loaded"

**Cause:** JavaScript files not loading properly

**Solutions:**
```bash
# 1. Verify files exist
ls -la app/public/Browser*

# Should see:
# - BrowserPrint-3.1.250.min.js
# - BrowserPrint-Zebra-1.1.250.min.js

# 2. Check file sizes (should be ~50KB and ~10KB)
ls -lh app/public/Browser*

# 3. Rebuild and restart
cd app
npm run dev
```

**In Browser:**
1. Open DevTools (F12)
2. Go to Console tab
3. Look for script loading errors
4. Check Network tab - verify files loaded (Status 200)

### 2. "No printers found"

**Cause:** Zebra Browser Print service not running or printer not paired

**On Zebra T56:**
1. **Install Browser Print Service**
   - Download Android version from Zebra website
   - Install APK
   - Launch the service

2. **Pair Bluetooth Printer**
   - Settings → Bluetooth
   - Pair your Zebra printer (ZQ320/520/630)
   - Ensure connected (blue dot)

3. **Check Printer**
   - Printer is powered on
   - Has labels loaded
   - Within Bluetooth range
   - Fully charged or plugged in

4. **Test Browser Print Service**
   - Open Browser Print app on T56
   - Should see printer listed
   - Test print from the app

### 3. Scripts Loading But No Detection

**Check Browser Console:**
```javascript
// In browser DevTools console, type:
window.BrowserPrint

// Should see: Object {getDefaultDevice: ƒ, getLocalDevices: ƒ, ...}
// If undefined, scripts didn't load
```

**Check Script Loading Order:**
1. BrowserPrint-3.1.250.min.js loads first
2. Then BrowserPrint-Zebra-1.1.250.min.js

See console logs:
```
✓ BrowserPrint library loaded
✓ Zebra helper library loaded
BrowserPrint available: true
```

### 4. Development vs Production

**Development (localhost):**
```bash
cd app
npm run dev
# Access: http://localhost:3000
```

**Production (Vercel):**
- Make sure scripts are in `app/public/` folder
- Vercel auto-serves files from public/
- Check Network tab for 404 errors

### 5. HTTPS Required?

**No!** Zebra Browser Print works on HTTP (localhost) and HTTPS.

But if you see security errors:
- Vercel provides HTTPS automatically
- localhost works fine without HTTPS

## Debug Steps

### Step 1: Check Files
```bash
cd /Volumes/DataHubMini/Github_2/bp-rx-sticker
ls -la app/public/BrowserPrint*

# Should show:
# BrowserPrint-3.1.250.min.js (~50KB)
# BrowserPrint-Zebra-1.1.250.min.js (~10KB)
```

### Step 2: Test Locally
```bash
cd app
npm run dev
# Open http://localhost:3000
# Click "🔧 Diagnostics"
```

### Step 3: Check Browser Console
1. F12 to open DevTools
2. Console tab
3. Look for:
   - ✓ Script loading messages
   - ✓ BrowserPrint available: true
   - ✗ Any red error messages

### Step 4: Check Network Tab
1. F12 → Network tab
2. Refresh page
3. Filter: "BrowserPrint"
4. Both files should show Status: 200 (not 404)

### Step 5: Test Browser Print Service
**On T56 device:**
1. Open Browser Print app
2. Should auto-detect paired printer
3. Try test print from app
4. If this works, app should work too

## Manual Test

In browser console, run this:
```javascript
// Test if BrowserPrint is available
console.log('BrowserPrint:', window.BrowserPrint);

// Try to get devices
window.BrowserPrint.getLocalDevices(
  function(devices) {
    console.log('Found devices:', devices);
  },
  function(error) {
    console.error('Error:', error);
  }
);
```

## Expected Console Output

When working correctly:
```
✓ BrowserPrint library loaded
✓ Zebra helper library loaded
BrowserPrint available: true
✓ BrowserPrint SDK found, attempting to connect...
Found devices: Array(1)
  0: {name: "ZQ320", connection: "bluetooth", ...}
✅ Connected to printer: ZQ320
```

## Still Not Working?

### Check T56 Device:
- [ ] Browser Print service installed
- [ ] Service is running (check running apps)
- [ ] Printer paired in Bluetooth settings
- [ ] Printer shows as connected
- [ ] Printer has power and labels

### Check App:
- [ ] Scripts in app/public/ folder
- [ ] No 404 errors in Network tab
- [ ] window.BrowserPrint exists in console
- [ ] Diagnostics shows SDK loaded

### Check Network:
- [ ] T56 on same WiFi as API server
- [ ] Can access API: `http://172.18.129.154:3000/health`
- [ ] App loads fully (not blocked)

## Get More Help

If still stuck:
1. Screenshot of Diagnostics panel
2. Screenshot of browser console errors
3. Screenshot of Network tab
4. Let me know what device/browser you're using

## Quick Fixes

### Clear Cache
```bash
# In browser
Ctrl+Shift+R (Windows)
Cmd+Shift+R (Mac)

# Or clear cache manually:
Settings → Clear browsing data → Cached files
```

### Reinstall Dependencies
```bash
cd app
rm -rf node_modules .next
npm install
npm run dev
```

### Try Different Browser
- Chrome (recommended)
- Edge (Chromium)
- Firefox (may have issues)
- Safari (may have issues)

---

**Most common fix:** Install/restart Zebra Browser Print service on the T56 device!
