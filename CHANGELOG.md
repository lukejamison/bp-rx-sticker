# Changelog

All notable changes to the BP RX Sticker System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### In Progress
- Invoice number search capability (API ready, frontend pending)
- Duplicate product handler across multiple invoices (API ready, frontend pending)
- Data sync timing info banner
- Weekend-aware time window (auto-72 hours on Monday)

## [1.2.0] - 2026-02-09

### Added
- **Multiple Label Printing**: Automatically prints X labels based on invoice quantity
  - New `generateMultipleLabels()` function in `lib/zpl.ts`
  - Safety limit: 1-100 labels per scan
  - Success message shows number of labels printed
- **HTML Label Preview Template**: `label-preview.html` for visual testing
  - Actual 1" x 1" size rendering
  - Print to PDF capability
  - Generate multiple labels for testing
  - Examples with different data
- **Universal Search API Endpoint**: `api-endpoints/universal-search-endpoint.js`
  - Handles UPC, NDC, and Invoice Number in one endpoint
  - Auto-detects input type
  - Returns multiple matches when duplicates found
  - Supports invoice-level search (returns all items)
- **Project Changelog**: `CHANGELOG.md` with semantic versioning
- **Improvements Summary**: `IMPROVEMENTS_SUMMARY.md` tracking all enhancements

### Fixed
- **Keyboard Auto-Show**: Input now respects user intent
  - Removed aggressive auto-focus on any click
  - Added `inputMode="none"` to prevent unwanted keyboard
  - Only shows keyboard when user deliberately taps input
  - Still auto-focuses on mount for scanner compatibility
- **Cost Display**: Now properly formats as currency with 2 decimals
  - Handles both string and number types
  - Uses `.toFixed(2)` for consistent display
- **Quantity Display**: Improved fallback logic
  - Shows `invoiceQty` → `quantity` → `'N/A'`
  - Handles missing/null values gracefully
- **"Already Completed" Message**: Enhanced with full details
  - Shows item name
  - Displays exact scan date/time
  - Displays exact print date/time
  - Suggests using "Reprint" button
  - Better formatted for readability

### Changed
- `ScanInput` component no longer aggressively re-focuses
- `ItemRow` component uses improved cost/qty formatting
- Store's scan workflow now prints multiple labels based on invoice qty
- "Already completed" workflow shows detailed timestamp info

### Documentation
- Added comprehensive troubleshooting sections to README
- Created `IMPROVEMENTS_SUMMARY.md` for tracking feature status
- Updated `CHANGELOG.md` with data sync timing notes
- Documented weekend invoice considerations

## [1.1.0] - 2026-02-09

### Fixed
- **CRITICAL**: Fixed "value too long for type character varying(100)" error
  - Increased database VARCHAR limits: strength (100→500), item_name (500→1000), device_id (100→255), scanned_by (100→255)
  - Migration: `002_increase_varchar_limits.sql`
  - Added safe truncation in API endpoint to prevent future errors

### Added
- Comprehensive API debugging tools
  - `diagnose-api.sh` - Automated diagnostic script
  - `diagnose-api-ssh.sh` - Remote diagnostic script via SSH
  - `API_DEBUG_GUIDE.md` - Complete debugging documentation
  - `QUICK_API_DEBUG.md` - Quick reference guide
  - `API_DEBUG_SETUP.md` - Setup instructions
  - `FIX_VARCHAR_ERROR.md` - Specific fix for VARCHAR errors
  - `api-logging/add-to-server.js` - Enhanced logging middleware
- Better error messages in frontend with troubleshooting hints
- Frontend now shows specific error types (404, 500, network)

## [1.0.0] - 2026-02-08

### Added
- Initial Progressive Web App (PWA) for BP RX Sticker System
- Zebra Browser Print integration for label printing
- Barcode scanning (UPC/NDC) with auto-submit
- Invoice item tracking with completion status
- Mock print mode for testing without hardware
- Dark mode support with system preference detection
- Debug mode with comprehensive console logging
- Floating debug panel for quick settings access
- Theme toggle (light/dark)
- Zebra printer diagnostics panel
- Development helper scripts (`dev-clean.sh`, `dev-stop.sh`)

### Backend
- 7 new API endpoints for item lookup and completion tracking
- New database table: `prx_invoices_completed`
- Migration: `001_create_completed_invoices_table.sql`
- 24-hour invoice filter based on `StatusChangedOn`
- Reprint tracking with count and timestamp
- Statistics endpoint for completed items

### API Endpoints
- `GET /api/items/upc/:upc/recent` - Lookup by UPC
- `GET /api/items/ndc/:ndc/recent` - Lookup by NDC
- `GET /api/items/barcode/:code/recent` - Auto-detect UPC or NDC
- `GET /api/invoices/:invoiceId/items` - Full invoice with completion status
- `POST /api/completed` - Mark item as completed after printing
- `POST /api/completed/:id/reprint` - Reprint label (increment counter)
- `GET /api/stats/completed` - Statistics on completed items

### Features
- Auto-focus on scan input
- Real-time invoice progress tracking (X of Y items completed)
- Visual feedback for completed items (checkmarks, strikethrough)
- Item detail expansion on click
- Reprint button for completed items
- Success/error toast notifications
- Printer status indicator with reconnect button
- 1"x1" ZPL label format with:
  - Item name (truncated if needed)
  - NDC with formatting
  - Last cost
  - Date received
  - Supplier name
  - Print timestamp

### Configuration
- Environment variables for API URL, debug mode, mock print
- Default port changed to 9000 for dev server
- `NEXT_PRIVATE_DISABLE_PERSISTENCE=1` to fix Turbopack on external drives

### Documentation
- `README.md` - Main setup guide
- `QUICKSTART.md` - Quick reference
- `DEBUG_GUIDE.md` - Frontend debugging
- `TESTING_READY.md` - Testing instructions
- `DEPLOY_VERCEL.md` - Vercel deployment guide
- `DEPLOY_CHECKLIST.md` - Deployment checklist
- `ARCHITECTURE.md` - System architecture diagram
- `MACOS_CLEANUP.md` - macOS resource fork file cleanup
- `EXTERNAL_DRIVE_FIX.md` - Turbopack external drive fix

### Fixed
- Turbopack persistence cache issues on external drives
- macOS `._` resource fork files being tracked by Git
- Port conflicts with multiple dev server instances
- Zebra Browser Print SDK loading and detection
- Multiple Next.js processes causing lock file issues

### Infrastructure
- Next.js 16 with Turbopack
- React 19
- TypeScript
- Tailwind CSS v4 with dark mode
- Zustand for state management
- Vercel deployment support

---

## Version History Summary

- **1.1.0** - Bug fixes for VARCHAR limits and enhanced debugging
- **1.0.0** - Initial release with full PWA, scanning, printing, and tracking

---

## Notes

### Data Sync Timing
- Invoice data syncs daily at **8:00 AM PST**
- Sync looks back at invoices updated in the **past 24 hours**
- **Weekend consideration**: No invoices on Sunday, so Monday sync should look back further
- Invoices arrive at various times:
  - Same day (after ordering)
  - Next morning (typically 4 AM)
  - Weekend orders arrive Monday via EDI

### Development Workflow
- **API/Database**: Located on Linux server (`luke@172.18.129.154`)
- **Frontend/UI**: Developed on Mac (`/Volumes/DataHubMini/Github_2/bp-rx-sticker/app`)
- **Migrations**: Apply on Linux server, then update changelog
- **API Updates**: Make changes in `api-endpoints/` folder, then manually apply to server

### Contributing
When making changes:
1. Update code
2. Test thoroughly
3. Update this CHANGELOG.md
4. Document in relevant README if needed
5. Commit with clear message
