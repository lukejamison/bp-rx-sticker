# 🔧 Fix: "value too long for type character varying(100)"

## Problem

Your API is crashing with this error:
```
Error marking item as completed: error: value too long for type character varying(100)
```

This happens when drug names, strengths, or other fields exceed the 100-character database limit.

**Example**: `"Acetaminophen 325mg / Hydrocodone Bitartrate 10mg Tablet"` = 60 chars  
But some drugs are even longer, especially combination medications.

## Solution (3 Steps - 2 Minutes)

### Step 1: Run the Migration

SSH to your server and run this:

```bash
ssh luke@172.18.129.154

# Run the migration
PGPASSWORD=3781 psql -h localhost -U luke -d prx_invoices -f ~/prx-api/migrations/002_increase_varchar_limits.sql
```

**This will increase the limits:**
- `strength`: 100 → 500 characters
- `item_name`: 500 → 1000 characters
- `device_id`: 100 → 255 characters
- `scanned_by`: 100 → 255 characters

### Step 2: Update the Endpoint (Optional but Recommended)

Add safeguards to truncate values if they're still too long:

```bash
# Edit your server.js
nano ~/prx-api/server.js

# Find the POST /api/completed endpoint
# Replace it with the code from: api-endpoints/fix-completed-endpoint.js
```

**Or** just add this helper function at the top of your endpoint:

```javascript
// Helper function to safely truncate strings
const truncate = (str, maxLength) => {
    if (!str) return null;
    return str.length > maxLength ? str.substring(0, maxLength) : str;
};

// Then use it in your values array:
const values = [
    invoiceId,
    invoiceNumber,
    itemId,
    ndc,
    upc,
    truncate(itemName, 1000),      // Now safe
    truncate(supplierName, 255),
    invoiceDate,
    statusChangedOn,
    cost,
    quantity,
    stockSize,
    truncate(strength, 500),        // Now safe
    truncate(scannedBy, 255) || null,
    truncate(deviceId, 255) || null
];
```

### Step 3: Restart API

```bash
sudo systemctl restart prx-api
```

## Verify the Fix

Test scanning a product:

```bash
# From your Mac or the app
curl -v "http://172.18.129.154:3000/api/items/barcode/YOUR_UPC_HERE/recent"
```

Should now work without errors!

## What Changed

### Before (FAILED ❌):
```sql
strength VARCHAR(100)  -- Too small for "Acetaminophen 325mg / Hydrocodone Bitartrate 10mg Tablet Extended Release"
```

### After (WORKS ✅):
```sql
strength VARCHAR(500)  -- Plenty of room for long drug names
```

## Quick Test

```bash
# 1. Run migration
ssh luke@172.18.129.154
PGPASSWORD=3781 psql -h localhost -U luke -d prx_invoices -f ~/prx-api/migrations/002_increase_varchar_limits.sql

# 2. Restart API
sudo systemctl restart prx-api

# 3. Test in your app
# Scan a product - should work now!
```

## If It Still Fails

Check the logs to see which field is too long:

```bash
sudo journalctl -u prx-api -n 20
```

If you see the error again, the field name will be in the error message. Let me know and I'll increase that field too.

## Future Prevention

The updated endpoint code includes automatic truncation, so even if a field exceeds the limit, it will be safely truncated instead of crashing.

---

**Summary**: Run the migration SQL file, restart the API, and you're done! 🚀
