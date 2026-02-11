#!/bin/bash

# API Diagnostic Script
# Run this to quickly identify API issues

set -e

API_URL="http://172.18.129.154:3000"
DB_HOST="172.18.129.154"
DB_USER="luke"
DB_NAME="prx_invoices"
DB_PASS="3781"

echo "🔍 BP RX Sticker API Diagnostics"
echo "=================================="
echo ""

# Test 1: API Health
echo "1️⃣  Testing API Health..."
if curl -s -f "$API_URL/health" > /dev/null 2>&1; then
    echo "   ✅ API is responding"
    curl -s "$API_URL/health" | jq -r '.status // "OK"' 2>/dev/null || echo "   OK"
else
    echo "   ❌ API is NOT responding at $API_URL"
    echo "   Check: Is the API running? Is the URL correct?"
    exit 1
fi
echo ""

# Test 2: Database Connection
echo "2️⃣  Testing Database Connection..."
if PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
    echo "   ✅ Database connection successful"
else
    echo "   ❌ Cannot connect to database"
    echo "   Check: Is PostgreSQL running? Are credentials correct?"
    exit 1
fi
echo ""

# Test 3: Check for prx_invoices_completed table
echo "3️⃣  Checking for prx_invoices_completed table..."
if PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "\d prx_invoices_completed" > /dev/null 2>&1; then
    echo "   ✅ Table exists"
else
    echo "   ❌ Table does NOT exist"
    echo "   Fix: Run migrations/001_create_completed_invoices_table.sql"
    exit 1
fi
echo ""

# Test 4: Count recent invoices
echo "4️⃣  Checking for recent invoices (last 24 hours)..."
RECENT_COUNT=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -c "
  SELECT COUNT(*) 
  FROM \"prx-invoices\" 
  WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '24 hours'
  AND \"StatusChangedOn\" IS NOT NULL;
")

if [ "$RECENT_COUNT" -gt 0 ]; then
    echo "   ✅ Found $RECENT_COUNT recent invoices"
else
    echo "   ⚠️  No invoices in last 24 hours"
    echo "   Try: Scan a barcode from a more recent invoice"
    echo "        Or increase time window to 48 hours"
fi
echo ""

# Test 5: Get a sample UPC for testing
echo "5️⃣  Getting sample UPC from recent invoice..."
SAMPLE_UPC=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -c "
  SELECT jsonb_array_elements(\"ItemDetails\"::jsonb)->>'UPC' as upc
  FROM \"prx-invoices\"
  WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '24 hours'
  AND \"ItemDetails\" IS NOT NULL
  LIMIT 1;
" 2>/dev/null)

if [ -n "$SAMPLE_UPC" ] && [ "$SAMPLE_UPC" != "" ]; then
    echo "   ✅ Sample UPC: $SAMPLE_UPC"
    echo ""
    
    # Test 6: Test API with sample UPC
    echo "6️⃣  Testing API with sample UPC..."
    API_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/items/barcode/$SAMPLE_UPC/recent")
    HTTP_CODE=$(echo "$API_RESPONSE" | tail -n1)
    BODY=$(echo "$API_RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "   ✅ API returned success (200)"
        echo "   Response:"
        echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    elif [ "$HTTP_CODE" = "404" ]; then
        echo "   ⚠️  API returned 404 (Not Found)"
        echo "   This might mean:"
        echo "   - StatusChangedOn filter is too strict"
        echo "   - UPC format doesn't match"
        echo "   Response: $BODY"
    elif [ "$HTTP_CODE" = "500" ]; then
        echo "   ❌ API returned 500 (Internal Server Error)"
        echo "   Check API logs: ssh luke@$DB_HOST 'sudo journalctl -u prx-api -n 50'"
        echo "   Error: $BODY"
        exit 1
    else
        echo "   ❌ Unexpected response code: $HTTP_CODE"
        echo "   Response: $BODY"
        exit 1
    fi
else
    echo "   ⚠️  No recent UPCs found"
    echo "   This means no invoices have been received in last 24 hours"
fi

echo ""
echo "=================================="
echo "✅ Basic diagnostics complete!"
echo ""
echo "Next steps:"
echo "1. Try scanning UPC: $SAMPLE_UPC"
echo "2. If that works, your barcodes might be NDC format instead"
echo "3. Check API logs: ssh luke@$DB_HOST 'sudo journalctl -u prx-api -f'"
echo "4. Enable detailed logging (see API_DEBUG_GUIDE.md)"
echo ""
