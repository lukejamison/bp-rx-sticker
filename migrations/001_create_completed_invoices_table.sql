-- Migration: Create prx_invoices_completed table
-- Purpose: Track which invoice items have been scanned and labeled
-- Date: 2026-02-08

CREATE TABLE IF NOT EXISTS "prx_invoices_completed" (
    -- Internal app columns
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Reference to original invoice
    "invoice_id" UUID NOT NULL,
    "invoice_number" VARCHAR(50) NOT NULL,
    
    -- Item identification
    "item_id" VARCHAR(255) NOT NULL,
    "ndc" VARCHAR(50) NOT NULL,
    "upc" VARCHAR(50) NOT NULL,
    "item_name" VARCHAR(500),
    
    -- Invoice details
    "supplier_name" VARCHAR(255),
    "invoice_date" TIMESTAMP,
    "status_changed_on" TIMESTAMP,
    
    -- Scan tracking
    "scanned_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanned_by" VARCHAR(100),
    "device_id" VARCHAR(100),
    
    -- Label details
    "label_printed" BOOLEAN DEFAULT TRUE,
    "label_printed_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "label_reprint_count" INTEGER DEFAULT 0,
    "last_reprint_at" TIMESTAMP,
    
    -- Item details for label
    "cost" DECIMAL(10,2),
    "quantity" VARCHAR(50),
    "stock_size" VARCHAR(50),
    "strength" VARCHAR(100),
    
    CONSTRAINT fk_invoice
        FOREIGN KEY("invoice_id") 
        REFERENCES "prx-invoices"("id")
        ON DELETE CASCADE
);

-- Indexes for fast lookups
CREATE INDEX idx_completed_invoice_id ON "prx_invoices_completed" ("invoice_id");
CREATE INDEX idx_completed_invoice_number ON "prx_invoices_completed" ("invoice_number");
CREATE INDEX idx_completed_ndc ON "prx_invoices_completed" ("ndc");
CREATE INDEX idx_completed_upc ON "prx_invoices_completed" ("upc");
CREATE INDEX idx_completed_scanned_at ON "prx_invoices_completed" ("scanned_at");
CREATE INDEX idx_completed_created_at ON "prx_invoices_completed" ("created_at");

-- Composite index for checking if item already completed
CREATE UNIQUE INDEX idx_unique_invoice_item 
    ON "prx_invoices_completed" ("invoice_id", "ndc", "upc");

-- Auto-update trigger for modified_at
CREATE TRIGGER update_prx_invoices_completed_modified_at
    BEFORE UPDATE ON "prx_invoices_completed"
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_at_column();

-- Comments for documentation
COMMENT ON TABLE "prx_invoices_completed" IS 'Tracks invoice items that have been scanned and labeled';
COMMENT ON COLUMN "prx_invoices_completed"."label_reprint_count" IS 'Number of times label has been reprinted';
COMMENT ON COLUMN "prx_invoices_completed"."device_id" IS 'Identifier of device that performed scan';
