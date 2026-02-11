#!/bin/bash

# API Diagnostic Script (Remote version)
# This runs directly on the API server via SSH

set -e

API_HOST="172.18.129.154"
API_URL="http://$API_HOST:3000"
DB_HOST="localhost"  # localhost when running on the server
DB_USER="luke"
DB_NAME="prx_invoices"
DB_PASS="3781"

echo "🔍 BP RX Sticker API Diagnostics (Remote)"
echo "Running on server: $API_HOST"
echo "==========================================="
echo ""

# Test 1: API Health
echo "1️⃣  Testing API Health..."
if curl -s -f "$API_URL/health" > /dev/null 2>&1; then
    echo "   ✅ API is responding"
    curl -s "$API_URL/health" | jq -r '.status // "OK"' 2>/dev/null || echo "   OK"
else
    echo "   ❌ API is NOT responding at $API_URL"
    echo "   Check: sudo systemctl status prx-api"
fi
echo ""

# Test 2: Database Connection
echo "2️⃣  Testing Database Connection..."
if PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
    echo "   ✅ Database connection successful"
else
    echo "   ❌ Cannot connect to database"
    echo "   Check: sudo systemctl status postgresql"
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
    echo ""
    echo "   Quick fix:"
    echo "   PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f ~/prx-api/migrations/001_create_completed_invoices_table.sql"
fi
echo ""

# Test 4: Count recent invoices
echo "4️⃣  Checking for recent invoices (last 24 hours)..."
RECENT_COUNT=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -c "
  SELECT COUNT(*) 
  FROM \"prx-invoices\" 
  WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '24 hours'
  AND \"StatusChangedOn\" IS NOT NULL;
" 2>/dev/null || echo "0")

if [ "$RECENT_COUNT" -gt 0 ]; then
    echo "   ✅ Found $RECENT_COUNT recent invoices"
else
    echo "   ⚠️  No invoices in last 24 hours"
    echo "   Checking last 48 hours..."
    RECENT_COUNT_48=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -c "
      SELECT COUNT(*) 
      FROM \"prx-invoices\" 
      WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '48 hours'
      AND \"StatusChangedOn\" IS NOT NULL;
    " 2>/dev/null || echo "0")
    
    if [ "$RECENT_COUNT_48" -gt 0 ]; then
        echo "   ⚠️  Found $RECENT_COUNT_48 invoices in last 48 hours"
        echo "   Suggestion: Increase time window in app to 48 hours"
    else
        echo "   ❌ No invoices in last 48 hours either"
        echo "   Check if StatusChangedOn field is populated"
    fi
fi
echo ""

# Test 5: Get a sample UPC for testing
echo "5️⃣  Getting sample UPC from recent invoice..."
SAMPLE_UPC=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -c "
  SELECT jsonb_array_elements(\"ItemDetails\"::jsonb)->>'UPC' as upc
  FROM \"prx-invoices\"
  WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '48 hours'
  AND \"ItemDetails\" IS NOT NULL
  AND jsonb_array_elements(\"ItemDetails\"::jsonb)->>'UPC' IS NOT NULL
  AND jsonb_array_elements(\"ItemDetails\"::jsonb)->>'UPC' != ''
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
        echo "   Item found and returned correctly"
        echo ""
        echo "   Response preview:"
        echo "$BODY" | jq -r '"\(.searchType) - \(.item.itemName) - $\(.item.cost)"' 2>/dev/null || echo "   $BODY" | head -c 200
    elif [ "$HTTP_CODE" = "404" ]; then
        echo "   ⚠️  API returned 404 (Not Found)"
        echo "   Response: $BODY"
        echo ""
        echo "   This might mean:"
        echo "   - StatusChangedOn filter is too strict"
        echo "   - Item not in recent invoices"
    elif [ "$HTTP_CODE" = "500" ]; then
        echo "   ❌ API returned 500 (Internal Server Error)"
        echo "   Response: $BODY"
        echo ""
        echo "   🚨 THIS IS YOUR PROBLEM!"
        echo "   Check API logs: sudo journalctl -u prx-api -n 50"
        echo ""
        echo "   Recent errors:"
        sudo journalctl -u prx-api --since "10 minutes ago" | grep -i "error" | tail -n 5 || echo "   (No recent errors in logs)"
    else
        echo "   ❌ Unexpected response code: $HTTP_CODE"
        echo "   Response: $BODY"
    fi
else
    echo "   ⚠️  No recent UPCs found"
    echo "   Checking for ANY invoices with UPCs..."
    
    SAMPLE_UPC_ANY=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -c "
      SELECT jsonb_array_elements(\"ItemDetails\"::jsonb)->>'UPC' as upc
      FROM \"prx-invoices\"
      WHERE \"ItemDetails\" IS NOT NULL
      LIMIT 1;
    " 2>/dev/null)
    
    if [ -n "$SAMPLE_UPC_ANY" ]; then
        echo "   Found UPC (from old invoice): $SAMPLE_UPC_ANY"
        echo "   Try this without time filter to test API logic"
    else
        echo "   ❌ No UPCs found in any invoices"
    fi
fi

echo ""
echo "==========================================="
echo "✅ Diagnostics complete!"
echo ""
echo "Next steps:"
echo "1. If API returned 500, check logs:"
echo "   sudo journalctl -u prx-api -n 100"
echo ""
echo "2. Add detailed logging (see API_DEBUG_SETUP.md)"
echo "   cd ~/prx-api"
echo "   npm install morgan"
echo "   # Add logging code to server.js"
echo "   sudo systemctl restart prx-api"
echo ""
echo "3. Watch logs in real-time:"
echo "   sudo journalctl -u prx-api -f"
echo ""
echo "4. Test with sample UPC:"
echo "   curl \"$API_URL/api/items/barcode/$SAMPLE_UPC/recent\""
echo ""
