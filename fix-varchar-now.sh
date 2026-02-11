#!/bin/bash

# Quick fix for "value too long for type character varying(100)" error
# This script runs the migration via SSH

SERVER="luke@172.18.129.154"
DB_PASS="3781"

echo "🔧 Fixing VARCHAR length limits..."
echo ""

ssh $SERVER << ENDSSH
echo "Running migration on server..."
PGPASSWORD=$DB_PASS psql -h localhost -U luke -d prx_invoices << 'EOSQL'

-- Increase VARCHAR limits
ALTER TABLE "prx_invoices_completed" 
ALTER COLUMN "strength" TYPE VARCHAR(500);

ALTER TABLE "prx_invoices_completed" 
ALTER COLUMN "device_id" TYPE VARCHAR(255);

ALTER TABLE "prx_invoices_completed" 
ALTER COLUMN "scanned_by" TYPE VARCHAR(255);

ALTER TABLE "prx_invoices_completed" 
ALTER COLUMN "item_name" TYPE VARCHAR(1000);

SELECT 'Migration completed successfully!' as status;

EOSQL

echo ""
echo "Restarting API..."
sudo systemctl restart prx-api

echo ""
echo "Checking API status..."
sleep 2
sudo systemctl status prx-api --no-pager | head -n 10

ENDSSH

echo ""
echo "✅ Done! Try scanning a product now."
echo ""
echo "If you still see errors, check logs:"
echo "ssh $SERVER 'sudo journalctl -u prx-api -n 20'"
