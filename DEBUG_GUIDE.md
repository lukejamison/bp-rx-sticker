# 🐛 Debug Mode Guide

## What's Been Added

✅ **Detailed console logging** - Every action is logged with timestamps  
✅ **Mock print mode** - Test without actual printer  
✅ **Debug panel** - View/change settings in the UI  
✅ **Visual indicators** - See when mock mode is active  

## Enable Debug Mode

Edit `app/.env.local`:

```env
# Enable detailed logging in browser console
NEXT_PUBLIC_DEBUG=true

# Simulate printing without actual printer
NEXT_PUBLIC_MOCK_PRINT=true

# Your API URL
NEXT_PUBLIC_API_URL=http://172.18.129.154:3000
```

Then restart the dev server:
```bash
cd app
npm run dev
```

## Console Logging

When debug mode is enabled, you'll see detailed logs like:

```
============================================================
🚀 BP RX Sticker App Starting...
Debug Mode: true
Mock Print: true
API URL: http://172.18.129.154:3000
============================================================

[INFO] 2026-02-10T04:15:23.123Z 📷 Barcode scanned: 369452356203
[DEBUG] 2026-02-10T04:15:23.124Z Current state: { scanning: false, hasInvoice: false }
[DEBUG] 2026-02-10T04:15:23.125Z State updated: scanning = true
[INFO] 2026-02-10T04:15:23.126Z 🔍 Looking up item in API...
[DEBUG] 2026-02-10T04:15:23.127Z API Request: { method: 'GET', url: '...' }
[DEBUG] 2026-02-10T04:15:23.234Z API Response: { status: 200, ok: true }
[INFO] 2026-02-10T04:15:23.235Z ✓ Item found: ROPINIROLE EQ 0.25MG
[DEBUG] 2026-02-10T04:15:23.236Z Full response: {...}
[INFO] 2026-02-10T04:15:23.237Z 🖨️  Preparing to print label...
[DEBUG] 2026-02-10T04:15:23.238Z Printer not connected, connecting now...
[INFO] 2026-02-10T04:15:23.239Z 🔌 Attempting to connect to printer...
[DEBUG] 2026-02-10T04:15:23.240Z Mock print mode: true
[INFO] 2026-02-10T04:15:23.241Z ✓ Mock print mode - simulating printer connection
[INFO] 2026-02-10T04:15:23.242Z ✓ Printer connected: Mock Printer (Testing Mode)
[DEBUG] 2026-02-10T04:15:23.243Z Mock mode: true
[DEBUG] 2026-02-10T04:15:23.244Z Generating ZPL label...
[DEBUG] 2026-02-10T04:15:23.245Z Generating ZPL label for: ROPINIROLE EQ 0.25MG
[DEBUG] 2026-02-10T04:15:23.246Z Label data processed: {...}
[DEBUG] 2026-02-10T04:15:23.247Z ZPL generated successfully, length: 245
[DEBUG] 2026-02-10T04:15:23.248Z ZPL generated, length: 245
[INFO] 2026-02-10T04:15:23.249Z 📤 Sending to printer...
[INFO] 2026-02-10T04:15:23.250Z 🖨️  Printing label...
[DEBUG] 2026-02-10T04:15:23.251Z ZPL Command: ^XA^FO20,15^A0N,23,23^FD...^XZ
[INFO] 2026-02-10T04:15:24.252Z ✓ Mock print - simulating 1 second print time
[INFO] 2026-02-10T04:15:24.253Z ✅ Mock print completed successfully
[INFO] 2026-02-10T04:15:24.254Z ✅ Print completed
[INFO] 2026-02-10T04:15:24.255Z 💾 Marking item as completed in database...
[DEBUG] 2026-02-10T04:15:24.256Z Completed item data: {...}
[DEBUG] 2026-02-10T04:15:24.257Z API Request: { method: 'POST', url: '...', body: {...} }
[INFO] 2026-02-10T04:15:24.345Z ✅ Item marked as completed
[DEBUG] 2026-02-10T04:15:24.346Z Updating UI state...
[INFO] 2026-02-10T04:15:24.347Z 🔄 Reloading invoice to update progress...
[INFO] 2026-02-10T04:15:24.348Z 📋 Loading invoice items: abc-123-def-456
[DEBUG] 2026-02-10T04:15:24.456Z Playing success sound
[INFO] 2026-02-10T04:15:24.457Z ✅ Scan workflow completed successfully
```

## Mock Print Mode

Perfect for testing **without** a physical printer!

### What It Does:
- ✅ Simulates printer connection (instant)
- ✅ Generates ZPL labels (same as real mode)
- ✅ Simulates 1-second print delay (realistic)
- ✅ Marks items as completed in database (real)
- ✅ Shows success messages (real)
- ❌ Doesn't actually send to printer

### When to Use:
- Testing on your computer
- UI/UX development
- API testing
- Training without wasting labels

### When to Disable:
- Testing on actual T56 device
- Production use
- Printer integration testing
- Real label printing

## Debug Panel UI

Click the **⚙️ Debug** button (bottom right) to see:

- Current settings (debug, mock print, API URL)
- Quick reload button
- Clear storage button
- Clear console button

## Logging Levels

### [INFO] - Always shown
- Major actions (scan, print, API calls)
- Success/error messages
- Connection status

### [DEBUG] - Only when debug mode enabled
- Detailed state changes
- API request/response data
- ZPL generation details
- Timing information

### [WARN] - Always shown
- Potential issues
- Fallback behaviors
- Already completed items

### [ERROR] - Always shown
- Failures and exceptions
- API errors
- Printer errors

## Testing Workflow

### 1. Test Without Printer
```bash
# Edit .env.local
NEXT_PUBLIC_DEBUG=true
NEXT_PUBLIC_MOCK_PRINT=true

# Start server
npm run dev

# Open http://localhost:9000
# Scan/type a barcode
# Check console for detailed logs
```

### 2. Test With Real Printer
```bash
# Edit .env.local
NEXT_PUBLIC_DEBUG=true
NEXT_PUBLIC_MOCK_PRINT=false  # ← Changed to false

# Restart server
npm run dev

# Must have Zebra Browser Print installed
# Must have printer paired
```

### 3. Production Mode
```bash
# Edit .env.local
NEXT_PUBLIC_DEBUG=false
NEXT_PUBLIC_MOCK_PRINT=false

# Build and deploy
npm run build
npm start
```

## Browser Console Tips

### Open Console
- **Mac**: `Cmd + Option + J`
- **Windows**: `Ctrl + Shift + J`
- **F12** then click "Console" tab

### Filter Logs
```javascript
// In console, type:

// Show only INFO logs
[INFO]

// Show only DEBUG logs
[DEBUG]

// Show only errors
[ERROR]
```

### Test Commands
```javascript
// Check if BrowserPrint loaded
console.log(window.BrowserPrint);

// Check environment variables
console.log({
  debug: process.env.NEXT_PUBLIC_DEBUG,
  mockPrint: process.env.NEXT_PUBLIC_MOCK_PRINT,
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
});

// Test API directly
fetch('http://172.18.129.154:3000/health')
  .then(r => r.json())
  .then(console.log);
```

## Common Log Patterns

### Successful Scan:
```
📷 Barcode scanned
🔍 Looking up item in API...
✓ Item found
🖨️  Preparing to print label...
📤 Sending to printer...
✅ Print completed
💾 Marking item as completed
✅ Scan workflow completed successfully
```

### Already Completed:
```
📷 Barcode scanned
🔍 Looking up item in API...
✓ Item found
⚠️  Item already completed
```

### Item Not Found:
```
📷 Barcode scanned
🔍 Looking up item in API...
❌ API Error: Item not found or not received within time window
```

### Printer Connection Issues:
```
🔌 Attempting to connect to printer...
❌ Printer connection error: No Zebra printers found
```

## Troubleshooting with Logs

### Issue: "Item not found"
Look for:
```
[DEBUG] API Request: { url: 'http://172.18.129.154:3000/api/items/barcode/...' }
[ERROR] API Error: { status: 404, ... }
```

**Fix**: Check API is running, barcode is correct, invoice is within 24 hours

### Issue: "Printer not connecting"
Look for:
```
[ERROR] window.BrowserPrint is undefined
```

**Fix**: BrowserPrint SDK not loaded, check Network tab for 404 errors

### Issue: "API connection failed"
Look for:
```
[ERROR] API Fetch Failed: TypeError: Failed to fetch
```

**Fix**: Check network, API URL, T56 on same network

## Performance Monitoring

Debug logs include timestamps, so you can measure:
- API response time
- Print time
- Total scan-to-complete time

Example:
```
[INFO] 04:15:23.126Z 🔍 Looking up item in API...
[INFO] 04:15:23.234Z ✓ Item found
# = 108ms API response time
```

## Save Logs

To save console logs for later review:

1. Right-click in console
2. "Save as..."
3. Save to file

Or copy all logs:
1. Right-click in console
2. "Copy all"
3. Paste into text file

---

**Quick Start:**
1. Enable debug mode in `.env.local`
2. Start dev server
3. Open console (F12)
4. Scan a barcode
5. Watch the detailed logs!
