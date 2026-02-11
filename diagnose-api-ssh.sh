#!/bin/bash

# SSH to server and run diagnostics there
# This avoids needing psql installed locally

SERVER="luke@172.18.129.154"

echo "🔗 Connecting to $SERVER to run diagnostics..."
echo ""

ssh $SERVER 'bash -s' << 'ENDSSH'
#!/bin/bash

API_URL="http://localhost:3000"
DB_HOST="localhost"
DB_USER="luke"
DB_NAME="prx_invoices"
DB_PASS="3781"

echo "🔍 BP RX Sticker API Diagnostics"
echo "Running on server: $(hostname)"
echo "==========================================="
echo ""

# Test 1: API Health
echo "1️⃣  Testing API Health..."
if curl -s -f "$API_URL/health" > /dev/null 2>&1; then
    echo "   ✅ API is responding"
else
    echo "   ❌ API is NOT responding"
    echo "   Status: $(sudo systemctl is-active prx-api)"
    echo "   Try: sudo systemctl status prx-api"
fi
echo ""

# Test 2: Database Connection
echo "2️⃣  Testing Database Connection..."
if PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
    echo "   ✅ Database connection successful"
else
    echo "   ❌ Cannot connect to database"
    echo "   PostgreSQL status: $(sudo systemctl is-active postgresql)"
fi
echo ""

# Test 3: Check for prx_invoices_completed table
echo "3️⃣  Checking for prx_invoices_completed table..."
TABLE_EXISTS=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -tAc "
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'prx_invoices_completed'
  );" 2>/dev/null)

if [ "$TABLE_EXISTS" = "t" ]; then
    echo "   ✅ Table exists"
else
    echo "   ❌ Table does NOT exist"
    echo "   Run: cd ~/prx-api && PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f migrations/001_create_completed_invoices_table.sql"
fi
echo ""

# Test 4: Count recent invoices
echo "4️⃣  Checking for recent invoices (last 24 hours)..."
RECENT_COUNT=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -c "
  SELECT COUNT(*) 
  FROM \"prx-invoices\" 
  WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '24 hours'
  AND \"StatusChangedOn\" IS NOT NULL;
" 2>/dev/null)

if [ "$RECENT_COUNT" -gt 0 ]; then
    echo "   ✅ Found $RECENT_COUNT recent invoices"
else
    echo "   ⚠️  No invoices in last 24 hours"
    
    # Check 48 hours
    RECENT_48=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -c "
      SELECT COUNT(*) 
      FROM \"prx-invoices\" 
      WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '48 hours'
      AND \"StatusChangedOn\" IS NOT NULL;
    " 2>/dev/null)
    
    if [ "$RECENT_48" -gt 0 ]; then
        echo "   Found $RECENT_48 invoices in last 48 hours"
    fi
fi
echo ""

# Test 5: Get sample UPC
echo "5️⃣  Getting sample UPC..."
SAMPLE_UPC=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -c "
  SELECT DISTINCT jsonb_array_elements(\"ItemDetails\"::jsonb)->>'UPC' as upc
  FROM \"prx-invoices\"
  WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '48 hours'
  AND \"ItemDetails\" IS NOT NULL
  LIMIT 1;
" 2>/dev/null | head -n1)

if [ -n "$SAMPLE_UPC" ]; then
    echo "   ✅ Sample UPC: $SAMPLE_UPC"
    
    # Test 6: Test API
    echo ""
    echo "6️⃣  Testing API with sample UPC..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/items/barcode/$SAMPLE_UPC/recent" 2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    case $HTTP_CODE in
        200)
            echo "   ✅ Success! API is working"
            echo "   Item: $(echo "$BODY" | grep -o '"itemName":"[^"]*"' | cut -d'"' -f4 | head -c 50)"
            ;;
        404)
            echo "   ⚠️  Item not found (404)"
            echo "   This might be a StatusChangedOn filter issue"
            ;;
        500)
            echo "   ❌ Server Error (500)"
            echo "   Response: $BODY"
            echo ""
            echo "   🚨 Check API logs:"
            sudo journalctl -u prx-api --since "10 minutes ago" | grep -E "(error|Error|ERROR)" | tail -n 10
            ;;
        *)
            echo "   ❌ Unexpected code: $HTTP_CODE"
            echo "   Response: $BODY"
            ;;
    esac
else
    echo "   ⚠️  No UPCs found in recent invoices"
fi

echo ""
echo "==========================================="
echo "✅ Diagnostics complete!"
echo ""
echo "Summary:"
echo "--------"
echo "API Status: $(systemctl is-active prx-api)"
echo "DB Status: $(systemctl is-active postgresql)"
echo "Recent invoices: $RECENT_COUNT"
echo "Sample UPC: ${SAMPLE_UPC:-None found}"
echo ""
echo "Next: Add logging and watch real-time errors"
echo "sudo journalctl -u prx-api -f"
ENDSSH

echo ""
echo "✅ Remote diagnostics complete!"
