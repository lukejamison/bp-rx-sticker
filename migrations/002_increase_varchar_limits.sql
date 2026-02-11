-- Migration: Increase VARCHAR limits for completed invoices table
-- Issue: "value too long for type character varying(100)" error
-- Some drug strengths and device IDs exceed 100 characters

-- Increase strength limit (can be very long for combination drugs)
ALTER TABLE "prx_invoices_completed" 
ALTER COLUMN "strength" TYPE VARCHAR(500);

-- Increase device_id limit (some device identifiers can be long)
ALTER TABLE "prx_invoices_completed" 
ALTER COLUMN "device_id" TYPE VARCHAR(255);

-- Increase scanned_by limit (for longer usernames/emails)
ALTER TABLE "prx_invoices_completed" 
ALTER COLUMN "scanned_by" TYPE VARCHAR(255);

-- Also increase item_name if not already done (some drug names are long)
ALTER TABLE "prx_invoices_completed" 
ALTER COLUMN "item_name" TYPE VARCHAR(1000);

COMMENT ON COLUMN "prx_invoices_completed"."strength" IS 'Drug strength - increased to 500 chars for combination drugs';
COMMENT ON COLUMN "prx_invoices_completed"."device_id" IS 'Device identifier - increased to 255 chars';
COMMENT ON COLUMN "prx_invoices_completed"."scanned_by" IS 'User identifier - increased to 255 chars';
COMMENT ON COLUMN "prx_invoices_completed"."item_name" IS 'Drug name - increased to 1000 chars for long names';
