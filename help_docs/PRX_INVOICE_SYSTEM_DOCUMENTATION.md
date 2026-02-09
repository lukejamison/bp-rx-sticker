# PioneerRx Invoice API System Documentation

## System Overview

This system captures invoice detail data from PioneerRx pharmacy software, stores it in a PostgreSQL database, and provides a REST API for querying invoice and item information.

## Architecture
```
PioneerRx ActiveReports (C#)
    ↓ HTTP POST
n8n Webhook (https://n8n.bushardspharmacy.com/webhook-test/invoice-detail)
    ↓ Transform Data (JavaScript)
PostgreSQL Database (172.18.129.154:5432)
    ↓ Query
Express REST API (172.18.129.154:3000)
```

## Component Locations

### 1. PioneerRx ActiveReports Script
- **Location**: PioneerRx application server
- **Report Name**: Invoice Detail Report (based on stored procedure `Item.InvoiceDetailsGetReport`)
- **Script Language**: C#
- **Webhook URL**: `https://n8n.bushardspharmacy.com/webhook-test/invoice-detail` (test) or `https://n8n.bushardspharmacy.com/webhook/invoice-detail` (production)
- **Log File**: `\\172.18.129.154\Logs\InvoiceDetailReportAPI.log`

#### C# Script Code
Located in ActiveReports Detail1_Format and ReportFooter1_Format events:
```csharp
// Global variables at report level
private Dictionary<string, object> itemsCollection = new Dictionary<string, object>();
private int itemCount = 0;

// In Detail1_Format event - collects each row
private void Detail1_Format(object sender, EventArgs e)
{
    Dictionary<string, string> item = new Dictionary<string, string>();
    
    // Add all 48 fields from the report
    item.Add("AWP", Fields["AWP"].Value?.ToString() ?? "");
    item.Add("AWPPackagePrice", Fields["AWPPackagePrice"].Value?.ToString() ?? "");
    // ... (all other fields)
    
    itemsCollection.Add("item_" + itemCount, item);
    itemCount++;
}

// In ReportFooter1_Format event - sends data
private void ReportFooter1_Format(object sender, EventArgs e)
{
    try
    {
        var jsonPayload = new {
            reportType = "Invoice Detail",
            generatedAt = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss"),
            totalItems = itemCount,
            items = itemsCollection.Values.ToList()
        };
        
        string json = Newtonsoft.Json.JsonConvert.SerializeObject(jsonPayload);
        
        using (var client = new System.Net.WebClient())
        {
            client.Headers[System.Net.HttpRequestHeader.ContentType] = "application/json";
            string response = client.UploadString(
                "https://n8n.bushardspharmacy.com/webhook-test/invoice-detail",
                json
            );
        }
        
        System.IO.File.AppendAllText(
            @"\\172.18.129.154\Logs\InvoiceDetailReportAPI.log",
            $"{DateTime.Now}: Successfully posted {itemCount} items\n"
        );
    }
    catch (Exception ex)
    {
        System.IO.File.AppendAllText(
            @"\\172.18.129.154\Logs\InvoiceDetailReportAPI.log",
            $"{DateTime.Now}: ERROR - {ex.Message}\n"
        );
    }
}
```

### 2. n8n Workflow
- **Location**: n8n instance at `https://n8n.bushardspharmacy.com`
- **Workflow Name**: Invoice Detail to PostgreSQL
- **Components**:
  1. Webhook Trigger
  2. JavaScript Function Node (data transformation)
  3. PostgreSQL Node (database insert)

#### JavaScript Function Node Code
```javascript
/**
 * n8n Function Node - Transform Invoice Detail JSON for PostgreSQL Insert
 */

const inputData = $input.all()[0].json;

let webhookData;
if (inputData.body) {
    webhookData = inputData.body;
} else if (inputData.reportType) {
    webhookData = inputData;
} else {
    throw new Error('Could not find webhook data');
}

if (!webhookData.items || !Array.isArray(webhookData.items)) {
    throw new Error('Items array not found');
}

const { items } = webhookData;

/**
 * Parse date from MM/DD/YYYY HH:MM:SS to ISO format
 */
function parseDate(dateString) {
    if (!dateString) return null;
    
    try {
        const [datePart, timePart] = dateString.split(' ');
        const [month, day, year] = datePart.split('/');
        const [hours, minutes, seconds] = (timePart || '00:00:00').split(':');
        
        const date = new Date(year, month - 1, day, hours, minutes, seconds);
        return date.toISOString();
    } catch (error) {
        console.error('Error parsing date:', dateString, error);
        return null;
    }
}

/**
 * Group items by invoice number
 */
function groupItemsByInvoice(items) {
    const grouped = {};

    items.forEach(item => {
        const invoiceNumber = item.InvoiceNumber;
        
        if (!grouped[invoiceNumber]) {
            grouped[invoiceNumber] = {
                InvoiceNumber: item.InvoiceNumber,
                InvoiceDate: item.InvoiceDate,
                InvoiceDetailID: item.InvoiceDetailID,
                SupplierName: item.SupplierName,
                StatusChangedOn: item.StatusChangedOn,
                LocationPrintName: item.LocationPrintName,
                items: []
            };
        }

        grouped[invoiceNumber].items.push(item);
    });

    return grouped;
}

const invoiceGroups = groupItemsByInvoice(items);
const records = [];

for (const [invoiceNumber, invoiceData] of Object.entries(invoiceGroups)) {
    const {
        InvoiceNumber,
        InvoiceDate,
        InvoiceDetailID,
        SupplierName,
        StatusChangedOn,
        items: invoiceItems
    } = invoiceData;

    records.push({
        InvoiceID: InvoiceDetailID,
        InvoiceDate: parseDate(InvoiceDate),
        InvoiceNumber: InvoiceNumber,
        SupplierName: SupplierName,
        StatusChangedOn: parseDate(StatusChangedOn),
        LocationID: null,
        TotalItems: invoiceItems.length,
        ItemDetails: JSON.stringify(invoiceItems),
        LastProcessedAt: new Date().toISOString()
    });
}

return records.map(record => ({ json: record }));
```

#### PostgreSQL Node Configuration

**Operation**: Insert  
**Mode**: Multiple Rows

**Query:**
```sql
INSERT INTO "prx-invoices" (
    "InvoiceID",
    "InvoiceDate",
    "InvoiceNumber",
    "SupplierName",
    "StatusChangedOn",
    "LocationID",
    "TotalItems",
    "ItemDetails",
    "LastProcessedAt"
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
)
ON CONFLICT ("InvoiceID") DO UPDATE SET
    "InvoiceDate" = EXCLUDED."InvoiceDate",
    "InvoiceNumber" = EXCLUDED."InvoiceNumber",
    "SupplierName" = EXCLUDED."SupplierName",
    "StatusChangedOn" = EXCLUDED."StatusChangedOn",
    "TotalItems" = EXCLUDED."TotalItems",
    "ItemDetails" = EXCLUDED."ItemDetails",
    "LastProcessedAt" = EXCLUDED."LastProcessedAt"
```

### 3. PostgreSQL Database
- **Host**: `172.18.129.154`
- **Port**: `5432`
- **Database**: `prx_invoices`
- **User**: `luke`
- **Password**: `3781`

#### Database Schema
```sql
-- Main invoices table
CREATE TABLE "prx-invoices" (
    -- Internal app columns
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- PioneerRx data columns
    "InvoiceID" VARCHAR(255) UNIQUE NOT NULL,
    "InvoiceDate" TIMESTAMP,
    "InvoiceNumber" VARCHAR(50) NOT NULL,
    "SupplierName" VARCHAR(255),
    "StatusChangedOn" TIMESTAMP,
    "LocationID" VARCHAR(255),
    "TotalItems" INTEGER,
    "ItemDetails" TEXT,
    "LastProcessedAt" TIMESTAMP
);

-- Indexes
CREATE INDEX idx_invoice_id ON "prx-invoices" ("InvoiceID");
CREATE INDEX idx_invoice_number ON "prx-invoices" ("InvoiceNumber");
CREATE INDEX idx_invoice_date ON "prx-invoices" ("InvoiceDate");
CREATE INDEX idx_supplier_name ON "prx-invoices" ("SupplierName");
CREATE INDEX idx_created_at ON "prx-invoices" ("created_at");
CREATE INDEX idx_modified_at ON "prx-invoices" ("modified_at");

-- Auto-update trigger for modified_at
CREATE OR REPLACE FUNCTION update_modified_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_prx_invoices_modified_at
    BEFORE UPDATE ON "prx-invoices"
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_at_column();
```

#### ItemDetails JSON Structure

The `ItemDetails` column stores a JSON array of invoice line items. Each item contains 48 fields:

**Key Fields:**
- `ItemID` - PioneerRx item UUID
- `ItemName` - Drug/product name
- `NDC` - National Drug Code
- `UPC` - Universal Product Code (used for lookups)
- `InvoiceCostPerUnit` - Cost per unit
- `InvoiceNumber` - Invoice number (duplicates parent)
- `InvoiceDate` - Invoice date (duplicates parent)
- `SupplierName` - Supplier name (duplicates parent)
- `CurrentOnHandQuantity` - On-hand quantity
- `StockSize` - Package size
- `Strength` - Drug strength
- `ReceivedQuantity` - Quantity received
- `StatusChangedOn` - When invoice status changed

**Pricing Fields:**
- `AWP`, `WAC`, `NADAC` - Various pricing metrics
- `PreferredCostForProfit` - Preferred cost calculation

**Other Fields:**
- Drug class, therapeutic class, DEA schedule, dosage form, label type, etc.

### 4. Express REST API
- **Location**: `/home/luke/prx-api/` on `172.18.129.154`
- **Port**: `3000`
- **Base URL**: `http://172.18.129.154:3000`
- **Service**: `prx-api.service` (systemd)

#### File Structure
```
/home/luke/prx-api/
├── server.js          # Main API server
├── package.json       # npm dependencies
├── .env              # Environment variables (DATABASE CREDENTIALS)
└── node_modules/     # Dependencies
```

#### Environment Variables (.env)
```env
PORT=3000
DB_HOST=172.18.129.154
DB_PORT=5432
DB_NAME=prx_invoices
DB_USER=luke
DB_PASSWORD=3781
```

#### API Endpoints

**GET /health**
- Health check endpoint
- Returns: `{ status: 'ok', timestamp: '...' }`

**GET /api/items/upc/:upc**
- Look up item by UPC code
- Example: `/api/items/upc/369452356203`
- Returns:
```json
{
  "item": {
    "itemName": "ROPINIROLE EQ 0.25MG",
    "ndc": "69452035620",
    "upc": "369452356203",
    "cost": "1.59",
    "lastReceived": "2/6/2026",
    "supplier": "IPCRx",
    "stockSize": "100.00",
    "strength": "0.25 mg",
    "onHand": "220.00"
  },
  "invoice": {
    "id": "...",
    "invoiceNumber": "11194035",
    "invoiceDate": "2026-02-06T00:00:00.000Z",
    "supplier": "IPCRx"
  }
}
```

**GET /api/items/search?q=searchterm**
- Search items by name (minimum 3 characters)
- Example: `/api/items/search?q=ropinirole`
- Returns array of matching items

#### Server.js Code
```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection pool
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to the database:', err.stack);
    } else {
        console.log('✅ Database connected successfully');
        release();
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/items/upc/:upc - Look up item by UPC
app.get('/api/items/upc/:upc', async (req, res) => {
    const { upc } = req.params;
    
    try {
        const query = `
            SELECT 
                id,
                "InvoiceID",
                "InvoiceNumber",
                "InvoiceDate",
                "SupplierName",
                "ItemDetails",
                "LastProcessedAt",
                created_at,
                modified_at
            FROM "prx-invoices"
            WHERE "ItemDetails"::text LIKE $1
            ORDER BY "InvoiceDate" DESC
            LIMIT 1
        `;
        
        const result = await pool.query(query, [`%"UPC":"${upc}"%`]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Item not found',
                upc: upc 
            });
        }
        
        const invoice = result.rows[0];
        const itemDetails = JSON.parse(invoice.ItemDetails);
        const item = itemDetails.find(i => i.UPC === upc);
        
        if (!item) {
            return res.status(404).json({ 
                error: 'Item not found in invoice details',
                upc: upc 
            });
        }
        
        res.json({
            item: {
                itemName: item.ItemName,
                ndc: item.NDC,
                upc: item.UPC,
                cost: parseFloat(item.InvoiceCostPerUnit).toFixed(2),
                lastReceived: new Date(invoice.InvoiceDate).toLocaleDateString('en-US'),
                supplier: item.SupplierName,
                stockSize: item.StockSize,
                strength: item.Strength,
                onHand: item.CurrentOnHandQuantity
            },
            invoice: {
                id: invoice.id,
                invoiceNumber: invoice.InvoiceNumber,
                invoiceDate: invoice.InvoiceDate,
                supplier: invoice.SupplierName
            }
        });
        
    } catch (error) {
        console.error('Error fetching item:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// GET /api/items/search?q=searchterm - Search items by name
app.get('/api/items/search', async (req, res) => {
    const { q } = req.query;
    
    if (!q || q.length < 3) {
        return res.status(400).json({ 
            error: 'Search query must be at least 3 characters' 
        });
    }
    
    try {
        const query = `
            SELECT 
                "InvoiceID",
                "InvoiceNumber",
                "InvoiceDate",
                "SupplierName",
                "ItemDetails"
            FROM "prx-invoices"
            WHERE "ItemDetails"::text ILIKE $1
            ORDER BY "InvoiceDate" DESC
            LIMIT 10
        `;
        
        const result = await pool.query(query, [`%${q}%`]);
        
        const items = [];
        result.rows.forEach(invoice => {
            const itemDetails = JSON.parse(invoice.ItemDetails);
            itemDetails.forEach(item => {
                if (item.ItemName.toLowerCase().includes(q.toLowerCase())) {
                    items.push({
                        itemName: item.ItemName,
                        ndc: item.NDC,
                        upc: item.UPC,
                        cost: parseFloat(item.InvoiceCostPerUnit).toFixed(2),
                        supplier: item.SupplierName,
                        invoiceDate: invoice.InvoiceDate
                    });
                }
            });
        });
        
        res.json({ 
            query: q,
            count: items.length,
            items: items 
        });
        
    } catch (error) {
        console.error('Error searching items:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PRX API Server running on http://0.0.0.0:${PORT}`);
    console.log(`📍 Health check: http://172.18.129.154:${PORT}/health`);
    console.log(`🔍 UPC lookup: http://172.18.129.154:${PORT}/api/items/upc/{upc}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    pool.end(() => {
        console.log('Database pool closed');
    });
});
```

#### Systemd Service Configuration

**File**: `/etc/systemd/system/prx-api.service`
```ini
[Unit]
Description=PRX Invoice API
After=network.target postgresql.service

[Service]
Type=simple
User=luke
WorkingDirectory=/home/luke/prx-api
ExecStart=/usr/bin/node /home/luke/prx-api/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Management Commands

### Database Commands
```bash
# Connect to database
psql -h 172.18.129.154 -U luke -d prx_invoices

# View tables
\dt

# Describe table structure
\d "prx-invoices"

# Count records
SELECT COUNT(*) FROM "prx-invoices";

# View recent invoices
SELECT "InvoiceNumber", "InvoiceDate", "SupplierName", "TotalItems" 
FROM "prx-invoices" 
ORDER BY "InvoiceDate" DESC 
LIMIT 10;

# Search for item by UPC in database directly
SELECT "InvoiceNumber", "InvoiceDate", "SupplierName" 
FROM "prx-invoices" 
WHERE "ItemDetails"::text LIKE '%"UPC":"369452356203"%';
```

### API Service Commands
```bash
# Start the API
sudo systemctl start prx-api

# Stop the API
sudo systemctl stop prx-api

# Restart the API
sudo systemctl restart prx-api

# Check status
sudo systemctl status prx-api

# View logs
sudo journalctl -u prx-api -f

# View last 100 lines of logs
sudo journalctl -u prx-api -n 100

# Enable auto-start on boot
sudo systemctl enable prx-api

# Disable auto-start
sudo systemctl disable prx-api
```

### Development Commands
```bash
# Navigate to API directory
cd ~/prx-api

# Install dependencies
npm install

# Run in development mode (auto-restart on changes)
npm run dev

# Run in production mode
npm start

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

### Testing Commands
```bash
# Test health endpoint
curl http://172.18.129.154:3000/health

# Test UPC lookup
curl http://172.18.129.154:3000/api/items/upc/369452356203

# Test search
curl http://172.18.129.154:3000/api/items/search?q=ropinirole

# Pretty print JSON response
curl http://172.18.129.154:3000/api/items/upc/369452356203 | jq

# Test from remote machine
curl http://172.18.129.154:3000/health
```

## Network Configuration

### Firewall Rules
```bash
# PostgreSQL
sudo ufw allow 5432/tcp

# API
sudo ufw allow 3000/tcp

# Check firewall status
sudo ufw status
```

### PostgreSQL Remote Access
- **Config File**: `/etc/postgresql/16/main/postgresql.conf`
  - Setting: `listen_addresses = '*'`
  
- **Access Control**: `/etc/postgresql/16/main/pg_hba.conf`
  - Rule: `host all all 0.0.0.0/0 md5`

## Data Flow

1. **Invoice Generation**: PioneerRx generates Invoice Detail report
2. **Data Collection**: ActiveReports C# script collects all 48 fields per item
3. **API POST**: Script sends JSON payload to n8n webhook
4. **Data Transformation**: n8n JavaScript function:
   - Groups items by invoice number
   - Parses dates to ISO format
   - Uses first item's `InvoiceDetailID` as `InvoiceID`
   - Creates one record per invoice with all items in `ItemDetails` JSON
5. **Database Insert**: PostgreSQL UPSERT operation:
   - Inserts new records
   - Updates existing records on `InvoiceID` conflict
   - Auto-generates `id`, `created_at`, `modified_at`
6. **API Query**: Express API queries database and returns formatted JSON

## Future Enhancements

### Potential API Endpoints to Add
```javascript
// GET /api/invoices/:invoiceNumber
// Get full invoice details by invoice number

// GET /api/invoices/date/:date
// Get all invoices for a specific date

// GET /api/suppliers
// List all suppliers

// GET /api/suppliers/:name/invoices
// Get all invoices from a specific supplier

// GET /api/items/ndc/:ndc
// Look up item by NDC

// GET /api/reports/daily
// Daily summary report

// POST /api/items/batch-lookup
// Batch UPC lookup (multiple UPCs at once)
```

### Database Optimizations
```sql
-- Add GIN index for JSON searching (much faster)
CREATE INDEX idx_item_details_gin ON "prx-invoices" USING gin("ItemDetails" jsonb_path_ops);

-- Add materialized view for common queries
CREATE MATERIALIZED VIEW invoice_summary AS
SELECT 
    "InvoiceNumber",
    "InvoiceDate",
    "SupplierName",
    "TotalItems",
    SUM((item->>'InvoiceCostPerUnit')::numeric) as total_cost
FROM "prx-invoices",
     jsonb_array_elements("ItemDetails"::jsonb) as item
GROUP BY "InvoiceNumber", "InvoiceDate", "SupplierName", "TotalItems";

-- Refresh materialized view
REFRESH MATERIALIZED VIEW invoice_summary;
```

## Troubleshooting

### n8n Webhook Not Receiving Data
- Check ActiveReports log: `\\172.18.129.154\Logs\InvoiceDetailReportAPI.log`
- Verify webhook URL is correct
- Test webhook manually with curl

### Database Connection Issues
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check PostgreSQL is listening
sudo netstat -plnt | grep 5432

# Test connection
psql -h 172.18.129.154 -U luke -d prx_invoices -c "SELECT 1;"
```

### API Not Responding
```bash
# Check service status
sudo systemctl status prx-api

# Check logs for errors
sudo journalctl -u prx-api -n 50

# Check if port is in use
sudo netstat -plnt | grep 3000

# Test database connection from API server
cd ~/prx-api
node -e "const {Pool} = require('pg'); const pool = new Pool({host:'172.18.129.154',port:5432,database:'prx_invoices',user:'luke',password:'3781'}); pool.query('SELECT NOW()', (err,res) => {console.log(err || res.rows); pool.end();});"
```

### Common Errors

**Error: "relation prx-invoices does not exist"**
- Solution: Create the table using the schema above

**Error: "password authentication failed"**
- Solution: Check `.env` file has correct password
- Verify `pg_hba.conf` allows md5 authentication

**Error: "ECONNREFUSED"**
- Solution: Check PostgreSQL is running and firewall allows port 5432

**Error: "Item not found"**
- Possible causes:
  - UPC doesn't exist in database
  - UPC format mismatch (check for leading zeros)
  - Invoice hasn't been processed yet

## Maintenance

### Daily Tasks
- None (fully automated)

### Weekly Tasks
- Check API logs for errors: `sudo journalctl -u prx-api --since "1 week ago"`
- Monitor database size: `SELECT pg_size_pretty(pg_database_size('prx_invoices'));`

### Monthly Tasks
- Review and archive old logs
- Check disk space: `df -h`
- Update npm packages: `cd ~/prx-api && npm update`

### Backup Strategy
```bash
# Backup database
pg_dump -h 172.18.129.154 -U luke prx_invoices > prx_invoices_backup_$(date +%Y%m%d).sql

# Restore database
psql -h 172.18.129.154 -U luke prx_invoices < prx_invoices_backup_YYYYMMDD.sql

# Automated daily backup (add to crontab)
0 2 * * * pg_dump -h 172.18.129.154 -U luke prx_invoices > /backups/prx_invoices_$(date +\%Y\%m\%d).sql
```

## Security Notes

- Database password is stored in `.env` file (protect this file!)
- API has no authentication (add JWT/API keys for production)
- Consider adding rate limiting to API endpoints
- Use HTTPS in production (add nginx reverse proxy)

## Contact & Support

- **System Owner**: Luke (CTO, Bushard's Pharmacy)
- **Location**: Laguna Beach, CA
- **Primary Use**: Stock label printing application

---

**Last Updated**: February 8, 2026  
**Document Version**: 1.0