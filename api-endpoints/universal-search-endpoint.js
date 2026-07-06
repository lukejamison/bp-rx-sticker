/**
 * ENHANCEMENT: Universal Barcode/Invoice Search Endpoint
 * 
 * This replaces the /api/items/barcode/:code/recent endpoint
 * to handle UPC, NDC, AND invoice numbers in one unified search
 * 
 * FEATURES:
 * - Auto-detects if input is UPC, NDC, or Invoice Number
 * - Handles duplicate products across multiple invoices
 * - Returns multiple matches when duplicates found
 * - Filters by recent invoices (24-48 hours, weekend-aware)
 * 
 * INSTALLATION:
 * Replace your existing /api/items/barcode/:code/recent endpoint with this
 */

app.get('/api/search/:query/recent', async (req, res) => {
    const { query } = req.params;
    const { hours = 168 } = req.query;
    
    console.log('🔍 Universal search:', { query, hours });
    
    try {
        // Step 1: Determine search type
        const isInvoiceNumber = /^INV/i.test(query) || /^[A-Z0-9-]+$/i.test(query) && query.length < 20;
        const isNumericCode = /^\d+$/.test(query);
        
        let searchType = 'UNKNOWN';
        let results = [];
        
        // Step 2: Search by invoice number first (most specific)
        if (isInvoiceNumber) {
            console.log('Trying Invoice Number search...');
            searchType = 'INVOICE_NUMBER';
            
            const invoiceQuery = `
                SELECT 
                    id,
                    "InvoiceID",
                    "InvoiceNumber",
                    "InvoiceDate",
                    "SupplierName",
                    "StatusChangedOn",
                    "ItemDetails",
                    "TotalItems"
                FROM "prx-invoices"
                WHERE "InvoiceNumber" ILIKE $1
                    AND (
                        "StatusChangedOn" >= NOW() - INTERVAL '1 hour' * $2
                        OR "InvoiceDate" >= NOW() - INTERVAL '1 hour' * $2
                    )
                ORDER BY "StatusChangedOn" DESC
                LIMIT 1
            `;
            
            const result = await pool.query(invoiceQuery, [`%${query}%`, hours]);
            
            if (result.rows.length > 0) {
                const invoice = result.rows[0];
                console.log('✓ Invoice found:', invoice.InvoiceNumber);
                
                // Return all items in this invoice
                const itemDetails = JSON.parse(invoice.ItemDetails);
                
                // Check completion status for each item
                const completionQuery = `
                    SELECT "ndc", "upc", "scanned_at", "label_printed_at", "label_reprint_count"
                    FROM "prx_invoices_completed"
                    WHERE "invoice_id" = $1
                `;
                const completedItems = await pool.query(completionQuery, [invoice.id]);
                const completedMap = new Map(
                    completedItems.rows.map(row => [`${row.ndc}-${row.upc}`, row])
                );
                
                return res.json({
                    searchType: 'INVOICE_NUMBER',
                    invoiceNumber: invoice.InvoiceNumber,
                    invoice: {
                        id: invoice.id,
                        invoiceNumber: invoice.InvoiceNumber,
                        invoiceDate: invoice.InvoiceDate,
                        statusChangedOn: invoice.StatusChangedOn,
                        supplier: invoice.SupplierName,
                        totalItems: invoice.TotalItems
                    },
                    items: itemDetails.map(item => {
                        const key = `${item.NDC}-${item.UPC}`;
                        const completionInfo = completedMap.get(key);
                        
                        return {
                            itemId: item.ItemID,
                            itemName: item.ItemName,
                            ndc: item.NDC,
                            upc: item.UPC,
                            cost: parseFloat(item.InvoiceCostPerUnit || 0).toFixed(2),
                            lastReceived: new Date(invoice.InvoiceDate).toLocaleDateString('en-US'),
                            supplier: item.SupplierName,
                            stockSize: item.StockSize,
                            strength: item.Strength,
                            invoiceQty: item.InvoiceQuantity,
                            receivedQty: item.ReceivedQuantity,
                            onHand: item.CurrentOnHandQuantity,
                            completed: !!completionInfo,
                            completionInfo: completionInfo ? {
                                scannedAt: completionInfo.scanned_at,
                                labelPrintedAt: completionInfo.label_printed_at,
                                reprintCount: completionInfo.label_reprint_count
                            } : null
                        };
                    })
                });
            }
        }
        
        // Step 3: Search by UPC/NDC if numeric
        if (isNumericCode) {
            console.log('Trying UPC/NDC search...');
            
            // Try UPC first
            const upcQuery = `
                SELECT 
                    id,
                    "InvoiceID",
                    "InvoiceNumber",
                    "InvoiceDate",
                    "SupplierName",
                    "StatusChangedOn",
                    "ItemDetails",
                    "TotalItems"
                FROM "prx-invoices"
                WHERE "ItemDetails"::text LIKE $1
                    AND (
                        "StatusChangedOn" >= NOW() - INTERVAL '1 hour' * $2
                        OR "InvoiceDate" >= NOW() - INTERVAL '1 hour' * $2
                    )
                ORDER BY "StatusChangedOn" DESC
            `;
            
            const upcResults = await pool.query(upcQuery, [`%"UPC":"${query}"%`, hours]);
            console.log('UPC search results:', upcResults.rows.length);
            
            if (upcResults.rows.length === 0) {
                // Try NDC
                console.log('No UPC matches, trying NDC...');
                const ndcResults = await pool.query(upcQuery, [`%"NDC":"${query}"%`, hours]);
                console.log('NDC search results:', ndcResults.rows.length);
                
                results = ndcResults.rows;
                searchType = 'NDC';
            } else {
                results = upcResults.rows;
                searchType = 'UPC';
            }
        }
        
        if (results.length === 0) {
            console.log('❌ No matches found');
            return res.status(404).json({
                error: 'Item not found',
                query: query,
                searchedAs: searchType,
                timeWindow: `${hours} hours`,
                suggestions: [
                    'Try a different barcode',
                    'Check if invoice is recent enough',
                    'Increase time window to 48 hours'
                ]
            });
        }
        
        // Step 4: Handle duplicates (same item in multiple invoices)
        if (results.length > 1) {
            console.log(`⚠️  Found ${results.length} invoices with this item`);
            
            // Map results to formatted data
            const matches = await Promise.all(results.map(async (invoice) => {
                const itemDetails = JSON.parse(invoice.ItemDetails);
                let item = null;
                
                if (searchType === 'UPC') {
                    item = itemDetails.find(i => i.UPC === query);
                } else if (searchType === 'NDC') {
                    item = itemDetails.find(i => i.NDC === query);
                }
                
                // Check if completed
                const completedCheck = await pool.query(`
                    SELECT "scanned_at", "label_printed_at", "label_reprint_count"
                    FROM "prx_invoices_completed"
                    WHERE "invoice_id" = $1 AND ("upc" = $2 OR "ndc" = $2)
                    LIMIT 1
                `, [invoice.id, query]);
                
                const completionInfo = completedCheck.rows[0] || null;
                
                return {
                    searchType: searchType,
                    item: {
                        itemId: item.ItemID,
                        itemName: item.ItemName,
                        ndc: item.NDC,
                        upc: item.UPC,
                        cost: parseFloat(item.InvoiceCostPerUnit || 0).toFixed(2),
                        lastReceived: new Date(invoice.InvoiceDate).toLocaleDateString('en-US'),
                        supplier: item.SupplierName,
                        stockSize: item.StockSize,
                        strength: item.Strength,
                        invoiceQty: item.InvoiceQuantity,
                        receivedQty: item.ReceivedQuantity,
                        onHand: item.CurrentOnHandQuantity
                    },
                    invoice: {
                        id: invoice.id,
                        invoiceNumber: invoice.InvoiceNumber,
                        invoiceDate: invoice.InvoiceDate,
                        statusChangedOn: invoice.StatusChangedOn,
                        supplier: invoice.SupplierName,
                        totalItems: invoice.TotalItems
                    },
                    completed: !!completionInfo,
                    completionInfo: completionInfo ? {
                        scannedAt: completionInfo.scanned_at,
                        labelPrintedAt: completionInfo.label_printed_at,
                        reprintCount: completionInfo.label_reprint_count
                    } : null
                };
            }));
            
            return res.json({
                isDuplicate: true,
                count: matches.length,
                message: `Found ${matches.length} invoices with this item. Please select one.`,
                matches: matches
            });
        }
        
        // Step 5: Single match - return item
        const invoice = results[0];
        console.log('✓ Single invoice found:', invoice.InvoiceNumber);
        
        const itemDetails = JSON.parse(invoice.ItemDetails);
        let item = null;
        
        if (searchType === 'UPC') {
            item = itemDetails.find(i => i.UPC === query);
        } else if (searchType === 'NDC') {
            item = itemDetails.find(i => i.NDC === query);
        }
        
        if (!item) {
            console.log('❌ Item not found in invoice details');
            return res.status(404).json({
                error: 'Item not found in invoice',
                query: query
            });
        }
        
        // Check completion
        const completedCheck = await pool.query(`
            SELECT "scanned_at", "label_printed_at", "label_reprint_count"
            FROM "prx_invoices_completed"
            WHERE "invoice_id" = $1 AND ("upc" = $2 OR "ndc" = $2)
            LIMIT 1
        `, [invoice.id, query]);
        
        const isCompleted = completedCheck.rows.length > 0;
        const completionInfo = completedCheck.rows[0] || null;
        
        console.log('✅ Returning single match');
        res.json({
            searchType: searchType,
            item: {
                itemId: item.ItemID,
                itemName: item.ItemName,
                ndc: item.NDC,
                upc: item.UPC,
                cost: parseFloat(item.InvoiceCostPerUnit || 0).toFixed(2),
                lastReceived: new Date(invoice.InvoiceDate).toLocaleDateString('en-US'),
                supplier: item.SupplierName,
                stockSize: item.StockSize,
                strength: item.Strength,
                invoiceQty: item.InvoiceQuantity,
                receivedQty: item.ReceivedQuantity,
                onHand: item.CurrentOnHandQuantity
            },
            invoice: {
                id: invoice.id,
                invoiceNumber: invoice.InvoiceNumber,
                invoiceDate: invoice.InvoiceDate,
                statusChangedOn: invoice.StatusChangedOn,
                supplier: invoice.SupplierName,
                totalItems: invoice.TotalItems
            },
            completed: isCompleted,
            completionInfo: completionInfo ? {
                scannedAt: completionInfo.scanned_at,
                labelPrintedAt: completionInfo.label_printed_at,
                reprintCount: completionInfo.label_reprint_count
            } : null
        });
        
    } catch (error) {
        console.error('❌ Error in universal search:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            query: query
        });
    }
});

/**
 * USAGE EXAMPLES:
 * 
 * Search by UPC:
 * GET /api/search/369452356203/recent
 * 
 * Search by NDC:
 * GET /api/search/68180051301/recent
 * 
 * Search by Invoice Number:
 * GET /api/search/INV-12345/recent
 * GET /api/search/WHS-2024-001/recent
 * 
 * With custom time window:
 * GET /api/search/369452356203/recent?hours=48
 * 
 * RESPONSE TYPES:
 * 
 * 1. Single Match (normal):
 * {
 *   "searchType": "UPC",
 *   "item": {...},
 *   "invoice": {...},
 *   "completed": false
 * }
 * 
 * 2. Multiple Matches (duplicates):
 * {
 *   "isDuplicate": true,
 *   "count": 2,
 *   "message": "Found 2 invoices with this item. Please select one.",
 *   "matches": [
 *     { "searchType": "UPC", "item": {...}, "invoice": {...} },
 *     { "searchType": "UPC", "item": {...}, "invoice": {...} }
 *   ]
 * }
 * 
 * 3. Invoice Number (all items):
 * {
 *   "searchType": "INVOICE_NUMBER",
 *   "invoiceNumber": "INV-12345",
 *   "invoice": {...},
 *   "items": [
 *     { "itemName": "...", "ndc": "...", "completed": false },
 *     { "itemName": "...", "ndc": "...", "completed": true }
 *   ]
 * }
 */
