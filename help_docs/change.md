# PRX Invoice API - Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-02-08

### Added - Sticker App Endpoints (Major Release)

#### Seven New Endpoints for Invoice Processing Workflow
Added comprehensive endpoint suite for sticker printing app with completion tracking, time-based filtering, and progress monitoring.

**New Endpoints:**
1. **GET /api/items/upc/:upc/recent** - Get recent invoice by UPC with 24hr time filter
2. **GET /api/items/ndc/:ndc/recent** - Get recent invoice by NDC with 24hr time filter  
3. **GET /api/items/barcode/:code/recent** - Smart search (tries UPC first, then NDC)
4. **GET /api/invoices/:invoiceId/items** - Get full invoice with completion status
5. **POST /api/completed** - Mark item as completed after scanning/printing
6. **POST /api/completed/:id/reprint** - Increment reprint counter for label reprints
7. **GET /api/stats/completed** - Get completion statistics with daily breakdown

#### New Database Table: `prx_invoices_completed`
- Tracks scanned items and printed labels
- Records timestamps for scans, prints, and reprints
- Stores user/device info for audit trail
- Unique constraint prevents duplicate completions
- Foreign key relationship to `prx-invoices` table
- Auto-incrementing reprint counter

**Key Features:**
- **Time Window Filtering**: Default 24-hour window (customizable with `?hours=` parameter)
- **Completion Tracking**: Shows if items already scanned/printed
- **Progress Monitoring**: Real-time completion percentage per invoice
- **Smart Barcode Search**: Single endpoint handles both UPC and NDC lookups
- **Audit Trail**: Tracks who scanned, when, and from which device
- **Reprint Counting**: Monitors label reprint frequency

**Breaking Changes:**
- New database table required (see migration file)
- Response format for `/recent` endpoints differs from original endpoints
- Added `StatusChangedOn` field filtering for time-based queries

**Migration Required:**
```bash
psql -h 172.18.129.154 -U luke -d prx_invoices -f migrations/001_create_completed_table.sql
```

**Usage Example:**
```bash
# Scan item
curl "http://172.18.129.154:3000/api/items/barcode/369452356203/recent"

# Mark as completed
curl -X POST "http://172.18.129.154:3000/api/completed" \
  -H "Content-Type: application/json" \
  -d '{ "invoiceId": "...", "ndc": "...", "upc": "...", ... }'

# View progress
curl "http://172.18.129.154:3000/api/invoices/{invoiceId}/items"
```

See [NEW_ENDPOINTS_SETUP.md](./NEW_ENDPOINTS_SETUP.md) for complete documentation.

### Added - API Response Enhancement

#### InvoiceQuantity Field
- Added `invoiceQty` (InvoiceQuantity) field to API JSON responses for better invoice tracking
  - **GET /api/items/upc/:upc** - Now includes `invoiceQty` in the item response object
  - **GET /api/items/search** - Now includes `invoiceQty` for each item in search results
  
**Technical Details:**
- Field maps from database `ItemDetails.InvoiceQuantity` to API response `invoiceQty`
- Uses consistent camelCase naming convention matching other response fields
- Shows the quantity of items that were received on the invoice

---

## [1.0.0] - 2026-02-08

### Initial Release

#### Core Features
- RESTful API for querying PioneerRx invoice data
- PostgreSQL database integration with connection pooling
- CORS-enabled for cross-origin requests
- Health check endpoint for monitoring

#### Endpoints
- **GET /health** - Health check endpoint returning status and timestamp
- **GET /api/items/upc/:upc** - Look up item details by UPC barcode
- **GET /api/items/search?q=query** - Search items by name (min 3 characters)

#### Infrastructure
- Systemd service configuration for reliable deployment
- Environment-based configuration via `.env` file
- Graceful shutdown handling for database connections
- Automatic modified_at timestamp updates via database triggers

#### Database Schema
- Main table: `prx-invoices` with UUID primary keys
- JSON storage for item details with efficient querying
- Multiple indexes for optimized lookups (invoice ID, date, supplier, etc.)
- Audit columns: created_at, modified_at

#### Data Pipeline Integration
- Receives data from n8n workflow via PioneerRx ActiveReports
- Processes invoice details with 48+ fields per item
- UPSERT operation prevents duplicate invoice records

---

## Notes

### Version Numbering
- Major version (X.0.0): Breaking API changes
- Minor version (0.X.0): New features, backward compatible
- Patch version (0.0.X): Bug fixes, minor improvements

### Deployment Process
After making changes to `server.js`:
1. Save the file
2. Restart the service: `sudo systemctl restart prx-api`
3. Verify status: `sudo systemctl status prx-api`
4. Check logs: `sudo journalctl -u prx-api -f`

### Links
- Documentation: [PRX_INVOICE_SYSTEM_DOCUMENTATION.md](./PRX_INVOICE_SYSTEM_DOCUMENTATION.md)
- API Base URL: http://172.18.129.154:3000
- Database: PostgreSQL on 172.18.129.154:5432
