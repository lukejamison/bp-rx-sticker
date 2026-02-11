# API Server Debugging Guide

## 🔴 Problem: "Internal Server Error" on Barcode Scan

If you're getting 500 errors when scanning barcodes, here's how to debug:

## Step 1: Add Logging to API Server

### Install morgan (logging library)
```bash
ssh luke@172.18.129.154
cd ~/prx-api
npm install morgan
```

### Add Logging Code

Open `server.js` and add the logging middleware from `api-logging/add-to-server.js`

**Key sections to add:**

1. **At the top** (with other requires):
```javascript
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
```

2. **After app.use(cors())** (before routes):
```javascript
// Console logging
app.use(morgan('dev'));

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

### Restart API
```bash
sudo systemctl restart prx-api
```

## Step 2: View Real-Time Logs

```bash
# SSH to server
ssh luke@172.18.129.154

# View API logs in real-time
sudo journalctl -u prx-api -f

# Or if you added file logging
tail -f ~/prx-api/logs/access.log
tail -f ~/prx-api/logs/error.log
```

## Step 3: Test a Barcode Scan

### From your app:
1. Scan a barcode
2. Watch the terminal with `journalctl -f`
3. You'll see:
   - Incoming request details
   - Database queries
   - Any errors with stack traces
   - Response sent

### Manual API test:
```bash
# Test with a known UPC (replace with yours)
curl -v "http://172.18.129.154:3000/api/items/barcode/369452356203/recent"

# You should see:
# - Request details
# - Response status (200, 404, or 500)
# - Response body
```

## Step 4: Common Issues & Fixes

### Error: "relation prx_invoices_completed does not exist"

**Problem**: New table not created

**Fix**:
```bash
ssh luke@172.18.129.154
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -f /path/to/001_create_completed_invoices_table.sql
```

### Error: "column does not exist"

**Problem**: Typo in column name or missing field

**Check query**:
```bash
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices

-- View table structure
\d "prx_invoices_completed"

-- Check if StatusChangedOn exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'prx-invoices';
```

### Error: "invalid input syntax for type timestamp"

**Problem**: Date format issue

**Check data**:
```sql
-- See actual data format
SELECT "StatusChangedOn", "InvoiceDate" 
FROM "prx-invoices" 
LIMIT 5;
```

### Error: "Cannot read property of undefined"

**Problem**: Missing field in ItemDetails JSON

**Debug**:
Add to your endpoint:
```javascript
console.log('Raw invoice:', invoice);
console.log('ItemDetails:', invoice.ItemDetails);
console.log('Parsed:', JSON.parse(invoice.ItemDetails));
```

## Step 5: Enhanced Endpoint Debugging

Add detailed logging to your barcode endpoint:

```javascript
app.get('/api/items/barcode/:code/recent', async (req, res) => {
  const { code } = req.params;
  const { hours = 24 } = req.query;
  
  console.log('🔍 Barcode lookup:', { code, hours });
  
  try {
    // Try UPC first
    console.log('Trying UPC search...');
    const upcQuery = `
      SELECT id, "InvoiceID", "InvoiceNumber", "InvoiceDate", 
             "SupplierName", "StatusChangedOn", "ItemDetails", "TotalItems"
      FROM "prx-invoices"
      WHERE "ItemDetails"::text LIKE $1
        AND "StatusChangedOn" >= NOW() - INTERVAL '1 hour' * $2
      ORDER BY "StatusChangedOn" DESC
      LIMIT 1
    `;
    
    console.log('Query params:', [`%"UPC":"${code}"%`, hours]);
    let result = await pool.query(upcQuery, [`%"UPC":"${code}"%`, hours]);
    console.log('UPC result rows:', result.rows.length);
    
    let searchType = 'UPC';
    let item = null;
    
    // If not found by UPC, try NDC
    if (result.rows.length === 0) {
      console.log('Not found by UPC, trying NDC...');
      result = await pool.query(upcQuery, [`%"NDC":"${code}"%`, hours]);
      console.log('NDC result rows:', result.rows.length);
      searchType = 'NDC';
    }
    
    if (result.rows.length === 0) {
      console.log('❌ Item not found in any search');
      return res.status(404).json({ 
        error: 'Item not found or not received within time window',
        code: code,
        timeWindow: `${hours} hours`,
        searchedAs: ['UPC', 'NDC']
      });
    }
    
    const invoice = result.rows[0];
    console.log('✓ Invoice found:', invoice.InvoiceNumber);
    console.log('StatusChangedOn:', invoice.StatusChangedOn);
    
    const itemDetails = JSON.parse(invoice.ItemDetails);
    console.log('Total items in invoice:', itemDetails.length);
    
    // Find the item
    if (searchType === 'UPC') {
      item = itemDetails.find(i => i.UPC === code);
    } else {
      item = itemDetails.find(i => i.NDC === code);
    }
    
    if (!item) {
      console.log('❌ Item not found in ItemDetails');
      return res.status(404).json({ 
        error: 'Item not found in invoice details',
        code: code 
      });
    }
    
    console.log('✓ Item found:', item.ItemName);
    
    // Check completion status
    console.log('Checking if already completed...');
    const completedCheck = await pool.query(`
      SELECT "scanned_at", "label_printed_at", "label_reprint_count"
      FROM "prx_invoices_completed"
      WHERE "invoice_id" = $1 AND ("upc" = $2 OR "ndc" = $2)
      LIMIT 1
    `, [invoice.id, code]);
    
    console.log('Completed check rows:', completedCheck.rows.length);
    
    const isCompleted = completedCheck.rows.length > 0;
    const completionInfo = isCompleted ? completedCheck.rows[0] : null;
    
    const response = {
      searchType: searchType,
      item: {
        itemId: item.ItemID,
        itemName: item.ItemName,
        ndc: item.NDC,
        upc: item.UPC,
        cost: parseFloat(item.InvoiceCostPerUnit || 0).toFixed(2),
        lastReceived: new Date(invoice.InvoiceDate).toLocaleDateString('en-US'),
        supplier: item.SupplierName,
        stockSize: item.StockSize,
        strength: item.Strength,
        invoiceQty: item.InvoiceQuantity,
        receivedQty: item.ReceivedQuantity,
        onHand: item.CurrentOnHandQuantity
      },
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.InvoiceNumber,
        invoiceDate: invoice.InvoiceDate,
        statusChangedOn: invoice.StatusChangedOn,
        supplier: invoice.SupplierName,
        totalItems: invoice.TotalItems
      },
      completed: isCompleted,
      completionInfo: completionInfo ? {
        scannedAt: completionInfo.scanned_at,
        labelPrintedAt: completionInfo.label_printed_at,
        reprintCount: completionInfo.label_reprint_count
      } : null
    };
    
    console.log('✅ Sending response');
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error in barcode lookup:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      code: code
    });
  }
});
```

## Step 6: Database Query Testing

Test queries directly:

```bash
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices

-- Test 1: Do you have recent invoices?
SELECT 
  "InvoiceNumber",
  "StatusChangedOn",
  NOW() - "StatusChangedOn" as age
FROM "prx-invoices"
WHERE "StatusChangedOn" >= NOW() - INTERVAL '24 hours'
ORDER BY "StatusChangedOn" DESC;

-- Test 2: Does your barcode exist?
SELECT 
  "InvoiceNumber",
  "StatusChangedOn"
FROM "prx-invoices"
WHERE "ItemDetails"::text LIKE '%"UPC":"YOUR_UPC_HERE"%'
ORDER BY "StatusChangedOn" DESC
LIMIT 1;

-- Test 3: Check StatusChangedOn field exists and has data
SELECT COUNT(*) as total,
       COUNT("StatusChangedOn") as with_status_changed
FROM "prx-invoices";

-- Test 4: See sample UPCs from recent invoices
SELECT 
  jsonb_array_elements("ItemDetails"::jsonb)->>'UPC' as upc,
  jsonb_array_elements("ItemDetails"::jsonb)->>'ItemName' as item,
  "StatusChangedOn"
FROM "prx-invoices"
WHERE "StatusChangedOn" >= NOW() - INTERVAL '24 hours'
LIMIT 5;
```

## Step 7: Quick Diagnostic Script

Save this as `test-api.sh`:

```bash
#!/bin/bash

API_URL="http://172.18.129.154:3000"
UPC="YOUR_TEST_UPC_HERE"

echo "Testing API at $API_URL"
echo "========================================"

echo ""
echo "1. Health Check:"
curl -s "$API_URL/health" | jq || curl -s "$API_URL/health"

echo ""
echo "2. Barcode Lookup (UPC: $UPC):"
curl -v "$API_URL/api/items/barcode/$UPC/recent" 2>&1 | grep -E "(< HTTP|error|message)"

echo ""
echo "3. Database Check:"
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -c "
  SELECT COUNT(*) as recent_invoices
  FROM \"prx-invoices\"
  WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '24 hours';
"

echo ""
echo "4. Check if UPC exists:"
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -c "
  SELECT \"InvoiceNumber\", \"StatusChangedOn\"
  FROM \"prx-invoices\"
  WHERE \"ItemDetails\"::text LIKE '%\"UPC\":\"$UPC\"%'
  ORDER BY \"StatusChangedOn\" DESC
  LIMIT 1;
"
```

## Most Likely Issues:

### 1. StatusChangedOn is NULL
```sql
-- Check for NULL values
SELECT COUNT(*) FROM "prx-invoices" WHERE "StatusChangedOn" IS NULL;

-- If many are NULL, your query fails
-- Fix: Update query to handle NULL or populate the field
```

### 2. Date Format Issues
```sql
-- Check date format
SELECT "StatusChangedOn", pg_typeof("StatusChangedOn") 
FROM "prx-invoices" 
LIMIT 5;

-- Should be: timestamp without time zone
```

### 3. Column Name Case Sensitivity
PostgreSQL is case-sensitive with quotes. Make sure column names match exactly:
- `"StatusChangedOn"` ✓
- `"statuschangedon"` ✗
- `StatusChangedOn` ✗

## Temporary Fix: Remove Time Filter

For immediate testing, comment out the time filter:

```javascript
// WHERE "ItemDetails"::text LIKE $1
//   AND "StatusChangedOn" >= NOW() - INTERVAL '1 hour' * $2

// Just for testing:
WHERE "ItemDetails"::text LIKE $1
```

This will return ANY invoice with that UPC, regardless of date.

## View Current API Logs

```bash
# Real-time logs
ssh luke@172.18.129.154 'sudo journalctl -u prx-api -f'

# Last 100 lines
ssh luke@172.18.129.154 'sudo journalctl -u prx-api -n 100'

# Today's errors only
ssh luke@172.18.129.154 'sudo journalctl -u prx-api --since today | grep -i error'
```

## Test API Manually

```bash
# Health check
curl http://172.18.129.154:3000/health

# Test barcode (replace with real UPC)
curl -v "http://172.18.129.154:3000/api/items/barcode/369452356203/recent"

# Test with 48 hours
curl -v "http://172.18.129.154:3000/api/items/barcode/369452356203/recent?hours=48"

# Pretty print with jq
curl -s "http://172.18.129.154:3000/api/items/barcode/369452356203/recent" | jq
```

## Check Database Directly

```bash
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices

-- Get a valid UPC from today
SELECT 
  jsonb_array_elements("ItemDetails"::jsonb)->>'UPC' as upc,
  "StatusChangedOn",
  AGE(NOW(), "StatusChangedOn") as age
FROM "prx-invoices"
WHERE "StatusChangedOn" IS NOT NULL
ORDER BY "StatusChangedOn" DESC
LIMIT 5;

-- Test the exact query the API uses (replace UPC)
SELECT 
  id, "InvoiceID", "InvoiceNumber", "StatusChangedOn"
FROM "prx-invoices"
WHERE "ItemDetails"::text LIKE '%"UPC":"369452356203"%'
  AND "StatusChangedOn" >= NOW() - INTERVAL '24 hours'
ORDER BY "StatusChangedOn" DESC
LIMIT 1;
```

## Enable Verbose Database Logging (Temporary)

```bash
ssh luke@172.18.129.154

# Edit PostgreSQL config
sudo nano /etc/postgresql/16/main/postgresql.conf

# Find and set:
log_statement = 'all'
log_duration = on

# Restart PostgreSQL
sudo systemctl restart postgresql

# View PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-16-main.log
```

**Remember to turn this OFF after debugging** (set `log_statement = 'none'`)

## Quick Diagnostic Checklist

Run these and tell me the results:

```bash
# 1. Is API running?
curl http://172.18.129.154:3000/health

# 2. Does prx_invoices_completed table exist?
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -c "\dt prx_invoices_completed"

# 3. How many recent invoices?
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -c "
  SELECT COUNT(*) FROM \"prx-invoices\" 
  WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '24 hours';
"

# 4. Get a sample UPC to test with
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -tAc "
  SELECT jsonb_array_elements(\"ItemDetails\"::jsonb)->>'UPC' as upc
  FROM \"prx-invoices\"
  WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '24 hours'
  LIMIT 1;
"

# 5. Test that UPC in API
# (use the UPC from step 4)
curl "http://172.18.129.154:3000/api/items/barcode/UPC_FROM_STEP_4/recent"
```

## Send Me These Results

Please run the diagnostic checklist above and share:
1. Output of each command
2. Any error messages
3. A sample UPC you're trying to scan

Then I can tell you exactly what's wrong!

---

**TL;DR - Quick Debug:**

```bash
# 1. Add logging to API (see api-logging/add-to-server.js)
# 2. Restart API
ssh luke@172.18.129.154 'sudo systemctl restart prx-api'

# 3. Watch logs while testing
ssh luke@172.18.129.154 'sudo journalctl -u prx-api -f'

# 4. Scan barcode in app
# 5. See detailed error in logs
```
