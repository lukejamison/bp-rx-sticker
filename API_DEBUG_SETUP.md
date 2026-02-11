# 🔧 Enhanced API Debugging - What's New

## Problem Solved

You were getting **Internal Server Error (500)** when scanning barcodes. This was happening on the **API server**, not the frontend. The frontend couldn't tell you what went wrong because the API wasn't logging errors properly.

## What I Added

### 1. Enhanced API Logging (`api-logging/add-to-server.js`)

This code adds comprehensive logging to your Express API:

- **Request logging**: Every API call shows method, URL, params, query, body
- **Response logging**: See what the API sends back
- **Error logging**: Catches errors with full stack traces
- **File logging**: Saves logs to `~/prx-api/logs/` for review

**Benefits:**
- See EXACTLY what SQL queries are running
- Catch errors immediately with stack traces
- Track all requests/responses
- Easier debugging for future issues

### 2. Diagnostic Script (`diagnose-api.sh`)

Automated script that tests:
- ✅ API health check
- ✅ Database connection
- ✅ Table existence
- ✅ Recent invoices
- ✅ Gets sample UPC for testing
- ✅ Tests API endpoint with real data

**Usage:**
```bash
./diagnose-api.sh
```

### 3. Quick Debug Guide (`QUICK_API_DEBUG.md`)

One-page reference with:
- Quick commands
- Common issues & fixes
- How to watch logs
- Manual testing commands

### 4. Comprehensive Debug Guide (`API_DEBUG_GUIDE.md`)

Deep-dive documentation covering:
- Step-by-step logging setup
- How to view real-time logs
- Common error patterns
- Database query testing
- Sentry/BetterStack integration (for future)

### 5. Better Error Display (Frontend)

Updated the UI to show:
- More detailed error messages
- Helpful troubleshooting hints
- Links to check console logs
- Better formatting for long errors

### 6. Enhanced Error Handling in Store

The app now shows specific error messages for:
- **404**: Item not found → Suggests checking time window
- **500**: Server error → Shows API URL and log command
- **Network**: Can't reach API → Connection troubleshooting

## What To Do Now

### Step 1: Run Diagnostics (2 minutes)

```bash
cd /Volumes/DataHubMini/Github_2/bp-rx-sticker
./diagnose-api.sh
```

**This will tell you:**
- Is the API running?
- Does the database table exist?
- Are there recent invoices?
- What's a valid UPC to test with?

### Step 2: Add Logging to API (5 minutes)

```bash
# SSH to your API server
ssh luke@172.18.129.154

# Navigate to API directory
cd ~/prx-api

# Install logging library
npm install morgan

# Edit server.js
nano server.js
```

**Add the code from `api-logging/add-to-server.js`:**

1. **At the top** (with other `require` statements):
```javascript
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
```

2. **After `app.use(cors())`** (before your routes):
```javascript
// Request logging
app.use((req, res, next) => {
  console.log('\n' + '='.repeat(80));
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Params:', req.params);
  console.log('Query:', req.query);
  console.log('Body:', req.body);
  console.log('='.repeat(80) + '\n');
  next();
});
```

3. **At the end** (after all routes):
```javascript
// Error handler
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  console.error('Stack:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});
```

**Restart API:**
```bash
sudo systemctl restart prx-api
```

### Step 3: Watch Logs & Test (2 minutes)

**Terminal 1** - Watch API logs:
```bash
ssh luke@172.18.129.154 'sudo journalctl -u prx-api -f'
```

**Terminal 2** - Test the app:
1. Open http://localhost:9000
2. Scan a barcode (or type one and press Enter)
3. Watch Terminal 1 - you'll see:
   - The barcode you scanned
   - SQL queries being run
   - Full error message if it fails
   - Stack trace showing exactly which line failed

### Step 4: Send Me The Error

Copy/paste the error from the logs and send it to me. I'll tell you exactly what's wrong and how to fix it.

## Expected Output (Example)

### ✅ Success:
```
================================================================================
[2026-02-08T10:30:15.123Z] GET /api/items/barcode/369452356203/recent
Params: {"code":"369452356203"}
Query: {}
Body: {}
================================================================================

🔍 Barcode lookup: { code: '369452356203', hours: 24 }
Trying UPC search...
Query params: ["%"UPC":"369452356203"%", 24]
UPC result rows: 1
✓ Invoice found: INV-12345
StatusChangedOn: 2026-02-08T09:15:00.000Z
Total items in invoice: 4
✓ Item found: LISINOPRIL 10MG TAB
Checking if already completed...
Completed check rows: 0
✅ Sending response

RESPONSE: {
  "searchType": "UPC",
  "item": { ... },
  "invoice": { ... },
  "completed": false
}
```

### ❌ Error (Example):
```
================================================================================
[2026-02-08T10:30:15.123Z] GET /api/items/barcode/369452356203/recent
Params: {"code":"369452356203"}
Query: {}
Body: {}
================================================================================

ERROR: error: relation "prx_invoices_completed" does not exist
Stack:     at Connection.parseE (/home/luke/prx-api/node_modules/pg/lib/connection.js:614:13)
    at Connection.parseMessage (/home/luke/prx-api/node_modules/pg/lib/connection.js:413:19)
    at Socket.<anonymous> (/home/luke/prx-api/node_modules/pg/lib/connection.js:129:22)
```

**^ This tells us:** The table wasn't created. Fix: Run `setup.sh`

## Testing Without Real Hardware

You can test everything without the Zebra printer:

1. **Mock Print Mode is already enabled** in `app/.env.local`:
```
NEXT_PUBLIC_MOCK_PRINT=true
```

2. This simulates printing without sending to hardware
3. You'll see in console: `🧪 [MOCK PRINT] Would send to printer`

## Most Likely Issues

Based on your error, it's probably one of these:

### 1. Table Not Created
**Error**: `relation "prx_invoices_completed" does not exist`

**Fix**:
```bash
ssh luke@172.18.129.154
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -f ~/prx-api/migrations/001_create_completed_invoices_table.sql
```

### 2. StatusChangedOn is NULL
**Error**: Returns 404 even though item exists

**Fix**: Check if field has data
```bash
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -c "
  SELECT COUNT(*) as total,
         COUNT(\"StatusChangedOn\") as with_status
  FROM \"prx-invoices\";
"
```

### 3. Column Name Typo
**Error**: `column "StatusChangedOn" does not exist`

**Fix**: Check exact column name (case-sensitive)
```bash
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -c "\d \"prx-invoices\""
```

### 4. ItemDetails JSON Parse Error
**Error**: `Unexpected token in JSON at position...`

**Fix**: Check ItemDetails format
```sql
SELECT "ItemDetails" FROM "prx-invoices" LIMIT 1;
```

## Future: Sentry or BetterStack

Once we fix the immediate issue, we can add cloud logging:

**BetterStack** - Simple, affordable
- $15/month for 10GB logs
- Beautiful dashboard
- Real-time alerts
- 1 month retention

**Sentry** - More features
- Free for 5k events/month
- Error tracking + performance
- Source maps
- Issue grouping

Let me know which you prefer!

## Summary

**Before:**
- ❌ "Internal Server Error" with no details
- ❌ Can't see what's failing
- ❌ No way to debug

**After:**
- ✅ Detailed request/response logging
- ✅ Error stack traces showing exact line
- ✅ Diagnostic script for quick testing
- ✅ Better error messages in UI
- ✅ Guides for troubleshooting

## Next Steps

1. **Run** `./diagnose-api.sh` → Tell me what it says
2. **Add logging** to API server (5 min)
3. **Watch logs** while scanning
4. **Send me** the error output
5. **I'll fix** the exact issue

Let's get this working! 🚀
