/**
 * PRX Invoice API - New Endpoints for Sticker App
 * Add these endpoints to your existing server.js file
 * Date: 2026-02-08
 */

function ndcLookupVariants(code) {
    const digits = String(code || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) return [code];

    const variants = new Set([code, digits, digits.padStart(11, '0')]);
    const unpadded = digits.replace(/^0+/, '');
    if (unpadded) variants.add(unpadded);
    return [...variants];
}

const RECENT_INVOICE_MATCH_LIMIT = 40;

function comparableDigits(value) {
    return String(value || '').replace(/\D/g, '').replace(/^0+/, '');
}

function codesEquivalent(a, b) {
    const left = comparableDigits(a);
    const right = comparableDigits(b);
    return left.length >= 8 && left === right;
}

function collectLookupCodes(primary, extra) {
    const codes = [];
    const seen = new Set();
    const add = (value) => {
        const code = String(value || '').trim();
        if (code.length < 8 || seen.has(code)) return;
        seen.add(code);
        codes.push(code);
        for (const variant of ndcLookupVariants(code)) {
            const normalized = String(variant || '').trim();
            if (normalized.length < 8 || seen.has(normalized)) continue;
            seen.add(normalized);
            codes.push(normalized);
        }
    };
    add(primary);
    String(extra || '').split(',').forEach(add);
    return codes.slice(0, 12);
}

function lineMatchesAnyCode(item, codes) {
    return codes.some((code) => codesEquivalent(item?.UPC, code) || codesEquivalent(item?.NDC, code));
}

function completionMatchesLine(row, item) {
    // Same invoice only (the caller already filtered by invoice id).
    // NDC or UPC is enough so a scanned GTIN and the invoice's own code
    // still recognize the line, without marking a different invoice done.
    return codesEquivalent(row.ndc, item?.NDC) || codesEquivalent(row.upc, item?.UPC);
}

async function queryRecentInvoicesForCodes(pool, codes, hours) {
    const unique = [...new Set(codes.map((code) => String(code || '').trim()).filter((code) => code.length >= 8))].slice(0, 12);
    if (unique.length === 0) return [];

    const patterns = unique.map((code) => `%${code.replace(/[\\%_]/g, '')}%`);
    const likes = patterns.map((_, index) => `"ItemDetails"::text LIKE $${index + 2}`).join(' OR ');
    const limitParam = patterns.length + 2;
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
            WHERE (${likes})
              AND (
                "StatusChangedOn" >= NOW() - INTERVAL '1 hour' * $1
                OR "InvoiceDate" >= NOW() - INTERVAL '1 hour' * $1
              )
            ORDER BY "StatusChangedOn" DESC NULLS LAST
            LIMIT $${limitParam}
        `;
    const result = await pool.query(query, [hours, ...patterns, RECENT_INVOICE_MATCH_LIMIT]);
    return result.rows;
}

/**
 * Same drug often sits on more than one open invoice (qty 2 on one, qty 1 on
 * another). Walk newest-first and return the first line that is not labeled
 * yet. Only say "already completed" when every matching line is done.
 * Completion never crosses invoice ids.
 */
async function pickOpenInvoiceLine(pool, invoices, codes) {
    const parsed = [];
    for (const invoice of invoices) {
        let itemDetails;
        try {
            itemDetails = typeof invoice.ItemDetails === 'string'
                ? JSON.parse(invoice.ItemDetails)
                : invoice.ItemDetails;
        } catch {
            continue;
        }
        if (!Array.isArray(itemDetails)) continue;
        const item = itemDetails.find((entry) => lineMatchesAnyCode(entry, codes));
        if (item) parsed.push({ invoice, item });
    }
    if (parsed.length === 0) return null;

    const ids = [...new Set(parsed.map((entry) => entry.invoice.id))];
    const completedResult = await pool.query(`
            SELECT
                "invoice_id",
                "ndc",
                "upc",
                "scanned_at",
                "label_printed_at",
                "label_reprint_count"
            FROM "prx_invoices_completed"
            WHERE "invoice_id" = ANY($1::uuid[])
        `, [ids]);

    let completedFallback = null;
    for (const entry of parsed) {
        const completionInfo = completedResult.rows.find((row) =>
            String(row.invoice_id) === String(entry.invoice.id) && completionMatchesLine(row, entry.item)
        );
        if (!completionInfo) {
            return { invoice: entry.invoice, item: entry.item, completionInfo: null };
        }
        if (!completedFallback) {
            completedFallback = {
                invoice: entry.invoice,
                item: entry.item,
                completionInfo
            };
        }
    }
    return completedFallback;
}

function formatStickerItemResponse(invoice, item, completionInfo, extra = {}) {
    const isCompleted = !!completionInfo;
    return {
        ...extra,
        item: {
            itemId: item.ItemID,
            itemName: item.ItemName,
            ndc: item.NDC,
            upc: item.UPC,
            cost: parseFloat(item.InvoiceCostPerUnit || 0).toFixed(2),
            lastReceived: new Date(invoice.InvoiceDate).toLocaleDateString('en-US'),
            supplier: item.SupplierName,
            supplierItemNumber: item.SupplierItemNumber || '',
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
    };
}

// ==========================================
// ENDPOINT 1: Get Recent Invoice by UPC (recent window filter)
// ==========================================
// GET /api/items/upc/:upc/recent
// Returns item if StatusChangedOn or InvoiceDate is within the hours window

app.get('/api/items/upc/:upc/recent', async (req, res) => {
    const { upc } = req.params;
    const { hours = 168 } = req.query; // Default 7 days
    
    try {
        const codes = collectLookupCodes(upc);
        const invoices = await queryRecentInvoicesForCodes(pool, codes, hours);

        if (invoices.length === 0) {
            return res.status(404).json({ 
                error: 'Item not found or not received within time window',
                upc: upc,
                timeWindow: `${hours} hours`
            });
        }

        const picked = await pickOpenInvoiceLine(pool, invoices, codes);

        if (!picked) {
            return res.status(404).json({ 
                error: 'Item not found in invoice details',
                upc: upc 
            });
        }

        res.json(formatStickerItemResponse(picked.invoice, picked.item, picked.completionInfo));
        
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
    const { hours = 168 } = req.query;
    
    try {
        const codes = collectLookupCodes(ndc);
        const invoices = await queryRecentInvoicesForCodes(pool, codes, hours);

        if (invoices.length === 0) {
            return res.status(404).json({ 
                error: 'Item not found or not received within time window',
                ndc: ndc,
                timeWindow: `${hours} hours`
            });
        }

        const picked = await pickOpenInvoiceLine(pool, invoices, codes);

        if (!picked) {
            return res.status(404).json({ 
                error: 'Item not found in invoice details',
                ndc: ndc 
            });
        }

        res.json(formatStickerItemResponse(picked.invoice, picked.item, picked.completionInfo));
        
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
                supplierItemNumber: item.SupplierItemNumber || '',
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
    const { hours = 168, candidates = '' } = req.query;
    
    try {
        // `candidates` lets the extension send every GS1-derived code in one
        // request. searchedAllCandidates tells the client not to repeat the
        // lookup one code at a time.
        const codes = collectLookupCodes(code, candidates);
        const invoices = await queryRecentInvoicesForCodes(pool, codes, hours);

        if (invoices.length === 0) {
            return res.status(404).json({ 
                error: 'Item not found or not received within time window',
                code: code,
                timeWindow: `${hours} hours`,
                searchedAs: ['UPC', 'NDC'],
                searchedAllCandidates: true
            });
        }

        const picked = await pickOpenInvoiceLine(pool, invoices, codes);

        if (!picked) {
            return res.status(404).json({ 
                error: 'Item not found in invoice details',
                code: code,
                searchedAllCandidates: true
            });
        }

        const searchType = codesEquivalent(picked.item.UPC, code) ? 'UPC' : 'NDC';
        res.json(formatStickerItemResponse(picked.invoice, picked.item, picked.completionInfo, {
            searchType,
            matchedCode: code,
            searchedAllCandidates: true,
        }));
        
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
