# 🚨 Quick API Debugging

Getting "Internal Server Error" when scanning? Follow these steps:

## Step 1: Run Diagnostic Script

```bash
./diagnose-api.sh
```

This will test your API, database, and give you a sample UPC to try.

## Step 2: Add Detailed Logging to API

```bash
# SSH to server
ssh luke@172.18.129.154

# Install logging library
cd ~/prx-api
npm install morgan

# Edit server.js - add the code from api-logging/add-to-server.js
nano server.js

# Restart API
sudo systemctl restart prx-api
```

## Step 3: Watch Logs While Testing

```bash
# Terminal 1: Watch API logs
ssh luke@172.18.129.154 'sudo journalctl -u prx-api -f'

# Terminal 2: Test the app
# Open http://localhost:9000 and scan a barcode

# You'll see real-time logs showing:
# - The barcode you scanned
# - Database queries
# - Any errors with stack traces
```

## Step 4: Test API Manually

```bash
# Test with curl (use a real UPC from your database)
curl -v "http://172.18.129.154:3000/api/items/barcode/YOUR_UPC_HERE/recent"

# Expected success (200):
{"searchType":"UPC","item":{...},"invoice":{...},"completed":false}

# Error 404:
{"error":"Item not found or not received within time window"}

# Error 500:
{"error":"Internal server error","message":"..."}
```

## Common Issues:

### ❌ "Item not found" but you know it exists

**Problem**: `StatusChangedOn` is NULL or too old

**Check**:
```bash
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -c "
  SELECT \"StatusChangedOn\", AGE(NOW(), \"StatusChangedOn\") as age
  FROM \"prx-invoices\" 
  ORDER BY \"StatusChangedOn\" DESC 
  LIMIT 5;
"
```

**Fix**: Increase time window or populate `StatusChangedOn`

### ❌ "relation prx_invoices_completed does not exist"

**Problem**: Migration not run

**Fix**:
```bash
ssh luke@172.18.129.154
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -f migrations/001_create_completed_invoices_table.sql
```

### ❌ "Cannot read property of undefined"

**Problem**: Missing field in database or wrong column name

**Check logs**: The error message will tell you which field is missing

**Fix**: Update query or check table schema

## Quick Commands Reference

```bash
# Check if API is running
curl http://172.18.129.154:3000/health

# View last 50 API log lines
ssh luke@172.18.129.154 'sudo journalctl -u prx-api -n 50'

# Check recent invoices
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -c "
  SELECT COUNT(*) FROM \"prx-invoices\" 
  WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '24 hours';
"

# Get sample UPC to test
PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -c "
  SELECT jsonb_array_elements(\"ItemDetails\"::jsonb)->>'UPC'
  FROM \"prx-invoices\"
  WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '24 hours'
  LIMIT 1;
"

# Test API endpoint
curl "http://172.18.129.154:3000/api/items/barcode/UPC_HERE/recent"
```

## For Better Stack or Sentry Integration

Once we identify the issue, we can add:

### Better Stack (Logtail)

```bash
npm install @logtail/node

# In server.js
const { Logtail } = require('@logtail/node');
const logtail = new Logtail('YOUR_SOURCE_TOKEN');

app.use((err, req, res, next) => {
  logtail.error('API Error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  // ... rest of error handler
});
```

### Sentry

```bash
npm install @sentry/node

# In server.js (at the top)
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  environment: 'production'
});

app.use(Sentry.Handlers.requestHandler());
// ... your routes ...
app.use(Sentry.Handlers.errorHandler());
```

---

## 🎯 Quick Start

Run this NOW to see what's happening:

```bash
# 1. Run diagnostics
./diagnose-api.sh

# 2. If that passes, watch logs and test
ssh luke@172.18.129.154 'sudo journalctl -u prx-api -f'

# Then scan a barcode in your app
# The logs will show you EXACTLY what's failing
```

Tell me what you see in the logs and I'll fix it! 🔧
