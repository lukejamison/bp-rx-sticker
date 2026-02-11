/**
 * UPDATED ENDPOINT: Mark Item as Completed
 * 
 * FIXES:
 * - Handles long values that exceed VARCHAR limits
 * - Better error messages
 * - Optional truncation for safety
 * 
 * Replace your existing POST /api/completed endpoint with this code
 */

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
    
    // Helper function to safely truncate strings
    const truncate = (str, maxLength) => {
        if (!str) return null;
        return str.length > maxLength ? str.substring(0, maxLength) : str;
    };
    
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
        
        // Prepare values with safe truncation
        // After running migration 002, these limits will be higher
        // But this provides a safety net
        const values = [
            invoiceId,                          // UUID - no truncation needed
            truncate(invoiceNumber, 50),        // VARCHAR(50)
            truncate(itemId, 255),              // VARCHAR(255)
            truncate(ndc, 50),                  // VARCHAR(50)
            truncate(upc, 50),                  // VARCHAR(50)
            truncate(itemName, 1000),           // VARCHAR(1000) after migration
            truncate(supplierName, 255),        // VARCHAR(255)
            invoiceDate,                        // TIMESTAMP
            statusChangedOn,                    // TIMESTAMP
            cost,                               // DECIMAL
            truncate(quantity, 50),             // VARCHAR(50)
            truncate(stockSize, 50),            // VARCHAR(50)
            truncate(strength, 500),            // VARCHAR(500) after migration
            truncate(scannedBy, 255) || null,   // VARCHAR(255) after migration
            truncate(deviceId, 255) || null     // VARCHAR(255) after migration
        ];
        
        console.log('Inserting completed item:', {
            invoiceNumber,
            ndc,
            itemName: itemName?.substring(0, 50) + (itemName?.length > 50 ? '...' : ''),
            strength: strength?.substring(0, 50) + (strength?.length > 50 ? '...' : '')
        });
        
        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) {
            // Item was already completed (conflict occurred)
            console.log('Item already completed:', ndc);
            return res.status(200).json({
                success: true,
                alreadyCompleted: true,
                message: 'Item was already marked as completed'
            });
        }
        
        console.log('Item marked as completed successfully:', result.rows[0].id);
        res.status(201).json({
            success: true,
            alreadyCompleted: false,
            data: result.rows[0],
            message: 'Item marked as completed successfully'
        });
        
    } catch (error) {
        console.error('Error marking item as completed:', error);
        console.error('Error details:', {
            code: error.code,
            detail: error.detail,
            constraint: error.constraint,
            table: error.table,
            column: error.column
        });
        
        // Provide more specific error messages
        let errorMessage = error.message;
        
        if (error.code === '22001') {
            // Value too long for type
            errorMessage = 'One or more fields exceed maximum length. Run migration 002 to fix.';
        } else if (error.code === '23505') {
            // Unique constraint violation
            errorMessage = 'Item already exists in completed table';
        } else if (error.code === '23503') {
            // Foreign key violation
            errorMessage = 'Invalid invoice ID - invoice does not exist';
        }
        
        res.status(500).json({ 
            error: 'Internal server error',
            message: errorMessage,
            code: error.code
        });
    }
});

/**
 * INSTALLATION:
 * 
 * 1. First, run the migration to increase VARCHAR limits:
 *    PGPASSWORD=3781 psql -h 172.18.129.154 -U luke -d prx_invoices -f migrations/002_increase_varchar_limits.sql
 * 
 * 2. Replace your existing POST /api/completed endpoint in server.js with this code
 * 
 * 3. Restart API:
 *    sudo systemctl restart prx-api
 * 
 * 4. Test:
 *    Should now handle long drug names and strengths without errors
 */
