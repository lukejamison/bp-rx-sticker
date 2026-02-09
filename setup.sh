#!/bin/bash

# PRX Sticker System - Quick Start Script
# This script helps you set up the database and API endpoints

set -e  # Exit on error

echo "=========================================="
echo "PRX Sticker System - Installation Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DB_HOST="172.18.129.154"
DB_PORT="5432"
DB_NAME="prx_invoices"
DB_USER="luke"
API_HOST="172.18.129.154"
API_PORT="3000"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo "Step 1: Checking prerequisites..."
echo "-----------------------------------"

# Check for psql
if command_exists psql; then
    echo -e "${GREEN}✓${NC} PostgreSQL client (psql) found"
else
    echo -e "${RED}✗${NC} PostgreSQL client (psql) not found"
    echo "  Please install: brew install postgresql (macOS) or apt install postgresql-client (Linux)"
    exit 1
fi

# Check for curl
if command_exists curl; then
    echo -e "${GREEN}✓${NC} curl found"
else
    echo -e "${RED}✗${NC} curl not found"
    exit 1
fi

# Check for jq (optional but nice)
if command_exists jq; then
    echo -e "${GREEN}✓${NC} jq found (JSON formatting)"
    HAS_JQ=true
else
    echo -e "${YELLOW}⚠${NC} jq not found (optional, for pretty JSON)"
    HAS_JQ=false
fi

echo ""
echo "Step 2: Testing database connection..."
echo "---------------------------------------"

if PGPASSWORD=3781 psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Database connection successful"
else
    echo -e "${RED}✗${NC} Cannot connect to database"
    echo "  Host: $DB_HOST:$DB_PORT"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    exit 1
fi

echo ""
echo "Step 3: Creating prx_invoices_completed table..."
echo "-------------------------------------------------"

# Check if table already exists
TABLE_EXISTS=$(PGPASSWORD=3781 psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='prx_invoices_completed';")

if [ "$TABLE_EXISTS" = "1" ]; then
    echo -e "${YELLOW}⚠${NC} Table 'prx_invoices_completed' already exists"
    read -p "Do you want to drop and recreate it? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        PGPASSWORD=3781 psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "DROP TABLE IF EXISTS \"prx_invoices_completed\" CASCADE;"
        echo -e "${GREEN}✓${NC} Table dropped"
    else
        echo "Skipping table creation..."
        SKIP_TABLE=true
    fi
fi

if [ "$SKIP_TABLE" != true ]; then
    PGPASSWORD=3781 psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f migrations/001_create_completed_invoices_table.sql
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Table created successfully"
    else
        echo -e "${RED}✗${NC} Failed to create table"
        exit 1
    fi
fi

# Verify table structure
echo ""
echo "Verifying table structure..."
ROW_COUNT=$(PGPASSWORD=3781 psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='prx_invoices_completed';")
echo -e "${GREEN}✓${NC} Table has $ROW_COUNT columns"

echo ""
echo "Step 4: Testing API connection..."
echo "----------------------------------"

API_URL="http://$API_HOST:$API_PORT/health"
if curl -s --max-time 5 "$API_URL" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} API is responding at $API_URL"
else
    echo -e "${RED}✗${NC} API is not responding at $API_URL"
    echo "  Make sure the API server is running:"
    echo "  ssh $DB_USER@$API_HOST 'sudo systemctl status prx-api'"
    exit 1
fi

echo ""
echo "Step 5: Testing new endpoints..."
echo "---------------------------------"

echo ""
echo "NOTE: You need to manually add the new endpoints to your server.js file"
echo "      SSH into $API_HOST and edit ~/prx-api/server.js"
echo "      Then restart with: sudo systemctl restart prx-api"
echo ""
read -p "Have you added the new endpoints and restarted the API? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Testing barcode lookup endpoint..."
    
    # Try to get a real UPC from the database
    SAMPLE_UPC=$(PGPASSWORD=3781 psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT (jsonb_array_elements(\"ItemDetails\"::jsonb)->>'UPC') as upc FROM \"prx-invoices\" WHERE \"StatusChangedOn\" >= NOW() - INTERVAL '24 hours' LIMIT 1;")
    
    if [ -n "$SAMPLE_UPC" ]; then
        echo "Found sample UPC: $SAMPLE_UPC"
        echo "Testing: GET /api/items/barcode/$SAMPLE_UPC/recent"
        
        if [ "$HAS_JQ" = true ]; then
            curl -s "http://$API_HOST:$API_PORT/api/items/barcode/$SAMPLE_UPC/recent" | jq .
        else
            curl -s "http://$API_HOST:$API_PORT/api/items/barcode/$SAMPLE_UPC/recent"
        fi
        
        echo ""
        echo -e "${GREEN}✓${NC} Endpoint test complete"
    else
        echo -e "${YELLOW}⚠${NC} No recent items found in database to test with"
        echo "  This is normal if you haven't received any invoices in the last 24 hours"
    fi
else
    echo "Skipping endpoint tests..."
fi

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ✓ Database connection verified"
echo "  ✓ Table 'prx_invoices_completed' created"
echo "  ✓ API server is running"
echo ""
echo "Next Steps:"
echo "  1. Add new endpoints to ~/prx-api/server.js on $API_HOST"
echo "     (Copy from api-endpoints/new-endpoints.js)"
echo "  2. Restart API: ssh $DB_USER@$API_HOST 'sudo systemctl restart prx-api'"
echo "  3. Start building the PWA frontend"
echo "  4. Install Zebra Browser Print on the T56 device"
echo ""
echo "Documentation:"
echo "  - API Documentation: help_docs/PRX_INVOICE_SYSTEM_DOCUMENTATION.md"
echo "  - Installation Guide: INSTALLATION.md"
echo "  - PWA Architecture: PWA_ARCHITECTURE.md"
echo ""
echo "Test Commands:"
echo "  # Test barcode lookup"
echo "  curl http://$API_HOST:$API_PORT/api/items/barcode/YOUR_UPC/recent | jq"
echo ""
echo "  # Test marking as completed"
echo "  curl -X POST http://$API_HOST:$API_PORT/api/completed \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"invoiceId\":\"...\",\"ndc\":\"...\",\"upc\":\"...\"}' | jq"
echo ""
echo "  # Get statistics"
echo "  curl http://$API_HOST:$API_PORT/api/stats/completed?days=7 | jq"
echo ""
