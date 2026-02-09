/**
 * PRX Invoice API - New Endpoints for Sticker App
 * Add these endpoints to your existing server.js file
 * Date: 2026-02-08
 */

// ==========================================
// ENDPOINT 1: Get Recent Invoice by UPC (24hr filter)
// ==========================================
// GET /api/items/upc/:upc/recent
// Returns item only if StatusChangedOn is within last 24 hours

app.get('/api/items/upc/:upc/recent', async (req, res) => {
    const { upc } = req.params;
    const { hours = 24 } = req.query; // Default 24 hours, can override with ?hours=48
    
    try {
        const query = `
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
              AND "StatusChangedOn" >= NOW() - INTERVAL '1 hour' * $2
            ORDER BY "StatusChangedOn" DESC
            LIMIT 1
        `;
        
        const result = await pool.query(query, [`%"UPC":"${upc}"%`, hours]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Item not found or not received within time window',
                upc: upc,
                timeWindow: `${hours} hours`
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

        // Check if this item has already been completed
        const completedCheck = await pool.query(`
            SELECT 
                "scanned_at",
                "label_printed_at",
                "label_reprint_count"
            FROM "prx_invoices_completed"
            WHERE "invoice_id" = $1 
              AND "upc" = $2
            LIMIT 1
        `, [invoice.id, upc]);

        const isCompleted = completedCheck.rows.length > 0;
        const completionInfo = isCompleted ? completedCheck.rows[0] : null;
        
        res.json({
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
        console.error('Error fetching recent item by UPC:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// ==========================================
// ENDPOINT 2: Get Recent Invoice by NDC (24hr filter)
// ==========================================
// GET /api/items/ndc/:ndc/recent

app.get('/api/items/ndc/:ndc/recent', async (req, res) => {
    const { ndc } = req.params;
    const { hours = 24 } = req.query;
    
    try {
        const query = `
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
              AND "StatusChangedOn" >= NOW() - INTERVAL '1 hour' * $2
            ORDER BY "StatusChangedOn" DESC
            LIMIT 1
        `;
        
        const result = await pool.query(query, [`%"NDC":"${ndc}"%`, hours]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Item not found or not received within time window',
                ndc: ndc,
                timeWindow: `${hours} hours`
            });
        }
        
        const invoice = result.rows[0];
        const itemDetails = JSON.parse(invoice.ItemDetails);
        const item = itemDetails.find(i => i.NDC === ndc);
        
        if (!item) {
            return res.status(404).json({ 
                error: 'Item not found in invoice details',
                ndc: ndc 
            });
        }

        // Check if this item has already been completed
        const completedCheck = await pool.query(`
            SELECT 
                "scanned_at",
                "label_printed_at",
                "label_reprint_count"
            FROM "prx_invoices_completed"
            WHERE "invoice_id" = $1 
              AND "ndc" = $2
            LIMIT 1
        `, [invoice.id, ndc]);

        const isCompleted = completedCheck.rows.length > 0;
        const completionInfo = isCompleted ? completedCheck.rows[0] : null;
        
        res.json({
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
        console.error('Error fetching recent item by NDC:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// ==========================================
// ENDPOINT 3: Get Full Invoice with Completion Status
// ==========================================
// GET /api/invoices/:invoiceId/items
// Returns all items in an invoice with their completion status

app.get('/api/invoices/:invoiceId/items', async (req, res) => {
    const { invoiceId } = req.params;
    
    try {
        // Get invoice
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
            WHERE id = $1
        `;
        
        const invoiceResult = await pool.query(invoiceQuery, [invoiceId]);
        
        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        
        const invoice = invoiceResult.rows[0];
        const itemDetails = JSON.parse(invoice.ItemDetails);
        
        // Get all completed items for this invoice
        const completedQuery = `
            SELECT 
                "ndc",
                "upc",
                "scanned_at",
                "label_printed_at",
                "label_reprint_count"
            FROM "prx_invoices_completed"
            WHERE "invoice_id" = $1
        `;
        
        const completedResult = await pool.query(completedQuery, [invoice.id]);
        const completedMap = {};
        
        completedResult.rows.forEach(row => {
            const key = `${row.ndc}_${row.upc}`;
            completedMap[key] = {
                scannedAt: row.scanned_at,
                labelPrintedAt: row.label_printed_at,
                reprintCount: row.label_reprint_count
            };
        });
        
        // Map items with completion status
        const items = itemDetails.map(item => {
            const key = `${item.NDC}_${item.UPC}`;
            const isCompleted = completedMap[key] !== undefined;
            
            return {
                itemId: item.ItemID,
                itemName: item.ItemName,
                ndc: item.NDC,
                upc: item.UPC,
                cost: parseFloat(item.InvoiceCostPerUnit || 0).toFixed(2),
                supplier: item.SupplierName,
                stockSize: item.StockSize,
                strength: item.Strength,
                invoiceQty: item.InvoiceQuantity,
                receivedQty: item.ReceivedQuantity,
                completed: isCompleted,
                completionInfo: completedMap[key] || null
            };
        });
        
        // Sort: incomplete first, completed at bottom
        items.sort((a, b) => {
            if (a.completed === b.completed) return 0;
            return a.completed ? 1 : -1;
        });
        
        const completedCount = items.filter(i => i.completed).length;
        
        res.json({
            invoice: {
                id: invoice.id,
                invoiceNumber: invoice.InvoiceNumber,
                invoiceDate: invoice.InvoiceDate,
                statusChangedOn: invoice.StatusChangedOn,
                supplier: invoice.SupplierName,
                totalItems: invoice.TotalItems
            },
            progress: {
                total: items.length,
                completed: completedCount,
                remaining: items.length - completedCount,
                percentage: ((completedCount / items.length) * 100).toFixed(1)
            },
            items: items
        });
        
    } catch (error) {
        console.error('Error fetching invoice items:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// ==========================================
// ENDPOINT 4: Mark Item as Completed (After Scanning/Printing)
// ==========================================
// POST /api/completed
// Body: { invoiceId, invoiceNumber, itemId, ndc, upc, itemName, cost, etc. }

app.post('/api/completed', async (req, res) => {
    const {
        invoiceId,
        invoiceNumber,
        itemId,
        ndc,
        upc,
        itemName,
        supplierName,
        invoiceDate,
        statusChangedOn,
        cost,
        quantity,
        stockSize,
        strength,
        scannedBy,
        deviceId
    } = req.body;
    
    // Validation
    if (!invoiceId || !ndc || !upc) {
        return res.status(400).json({ 
            error: 'Missing required fields: invoiceId, ndc, upc' 
        });
    }
    
    try {
        const query = `
            INSERT INTO "prx_invoices_completed" (
                "invoice_id",
                "invoice_number",
                "item_id",
                "ndc",
                "upc",
                "item_name",
                "supplier_name",
                "invoice_date",
                "status_changed_on",
                "cost",
                "quantity",
                "stock_size",
                "strength",
                "scanned_by",
                "device_id",
                "label_printed",
                "label_printed_at"
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE, NOW()
            )
            ON CONFLICT ("invoice_id", "ndc", "upc") 
            DO NOTHING
            RETURNING *
        `;
        
        const values = [
            invoiceId,
            invoiceNumber,
            itemId,
            ndc,
            upc,
            itemName,
            supplierName,
            invoiceDate,
            statusChangedOn,
            cost,
            quantity,
            stockSize,
            strength,
            scannedBy || null,
            deviceId || null
        ];
        
        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) {
            // Item was already completed (conflict occurred)
            return res.status(200).json({
                success: true,
                alreadyCompleted: true,
                message: 'Item was already marked as completed'
            });
        }
        
        res.status(201).json({
            success: true,
            alreadyCompleted: false,
            data: result.rows[0],
            message: 'Item marked as completed successfully'
        });
        
    } catch (error) {
        console.error('Error marking item as completed:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// ==========================================
// ENDPOINT 5: Reprint Label (Increment Reprint Count)
// ==========================================
// POST /api/completed/:id/reprint

app.post('/api/completed/:id/reprint', async (req, res) => {
    const { id } = req.params;
    
    try {
        const query = `
            UPDATE "prx_invoices_completed"
            SET 
                "label_reprint_count" = "label_reprint_count" + 1,
                "last_reprint_at" = NOW()
            WHERE id = $1
            RETURNING *
        `;
        
        const result = await pool.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Completed item not found' });
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Reprint count incremented'
        });
        
    } catch (error) {
        console.error('Error updating reprint count:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// ==========================================
// ENDPOINT 6: Get Completion Statistics
// ==========================================
// GET /api/stats/completed
// Optional query params: ?days=7

app.get('/api/stats/completed', async (req, res) => {
    const { days = 7 } = req.query;
    
    try {
        const query = `
            SELECT 
                DATE("scanned_at") as scan_date,
                COUNT(*) as items_scanned,
                COUNT(DISTINCT "invoice_id") as invoices_processed,
                SUM("label_reprint_count") as total_reprints
            FROM "prx_invoices_completed"
            WHERE "scanned_at" >= NOW() - INTERVAL '1 day' * $1
            GROUP BY DATE("scanned_at")
            ORDER BY scan_date DESC
        `;
        
        const result = await pool.query(query, [days]);
        
        // Get overall totals
        const totalsQuery = `
            SELECT 
                COUNT(*) as total_items,
                COUNT(DISTINCT "invoice_id") as total_invoices,
                SUM("label_reprint_count") as total_reprints
            FROM "prx_invoices_completed"
            WHERE "scanned_at" >= NOW() - INTERVAL '1 day' * $1
        `;
        
        const totalsResult = await pool.query(totalsQuery, [days]);
        
        res.json({
            period: `${days} days`,
            totals: totalsResult.rows[0],
            daily: result.rows
        });
        
    } catch (error) {
        console.error('Error fetching completion stats:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// ==========================================
// ENDPOINT 7: Search for Barcode (UPC or NDC)
// ==========================================
// GET /api/items/barcode/:code/recent
// Tries to find by UPC first, then NDC

app.get('/api/items/barcode/:code/recent', async (req, res) => {
    const { code } = req.params;
    const { hours = 24 } = req.query;
    
    try {
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
              AND "StatusChangedOn" >= NOW() - INTERVAL '1 hour' * $2
            ORDER BY "StatusChangedOn" DESC
            LIMIT 1
        `;
        
        let result = await pool.query(upcQuery, [`%"UPC":"${code}"%`, hours]);
        let searchType = 'UPC';
        let item = null;
        
        // If not found by UPC, try NDC
        if (result.rows.length === 0) {
            result = await pool.query(upcQuery, [`%"NDC":"${code}"%`, hours]);
            searchType = 'NDC';
        }
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Item not found or not received within time window',
                code: code,
                timeWindow: `${hours} hours`,
                searchedAs: ['UPC', 'NDC']
            });
        }
        
        const invoice = result.rows[0];
        const itemDetails = JSON.parse(invoice.ItemDetails);
        
        // Find the item
        if (searchType === 'UPC') {
            item = itemDetails.find(i => i.UPC === code);
        } else {
            item = itemDetails.find(i => i.NDC === code);
        }
        
        if (!item) {
            return res.status(404).json({ 
                error: 'Item not found in invoice details',
                code: code 
            });
        }

        // Check completion status
        const completedCheck = await pool.query(`
            SELECT 
                "scanned_at",
                "label_printed_at",
                "label_reprint_count"
            FROM "prx_invoices_completed"
            WHERE "invoice_id" = $1 
              AND ("upc" = $2 OR "ndc" = $2)
            LIMIT 1
        `, [invoice.id, code]);

        const isCompleted = completedCheck.rows.length > 0;
        const completionInfo = isCompleted ? completedCheck.rows[0] : null;
        
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
        console.error('Error fetching item by barcode:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

/**
 * USAGE EXAMPLES:
 * 
 * 1. Scan item (try UPC/NDC, get recent invoices only):
 *    GET http://172.18.129.154:3000/api/items/barcode/369452356203/recent
 *    GET http://172.18.129.154:3000/api/items/barcode/369452356203/recent?hours=48
 * 
 * 2. Mark item as completed after printing:
 *    POST http://172.18.129.154:3000/api/completed
 *    Body: { invoiceId: "...", ndc: "...", upc: "...", ... }
 * 
 * 3. Get full invoice with completion status:
 *    GET http://172.18.129.154:3000/api/invoices/{invoiceId}/items
 * 
 * 4. Reprint label:
 *    POST http://172.18.129.154:3000/api/completed/{completedItemId}/reprint
 * 
 * 5. View stats:
 *    GET http://172.18.129.154:3000/api/stats/completed?days=7
 */
