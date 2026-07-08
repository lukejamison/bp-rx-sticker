-- Migration: Deduplicate legacy "prx-invoices" rows left over from the old
-- (buggy) InvoiceID generation in the n8n "PRX Invoice Detail" workflow.
--
-- Background: before the fix, InvoiceID was set to an arbitrary line item's
-- ID instead of a stable per-invoice key, so re-running the batch resync
-- could mint a brand-new duplicate row for an invoice that already existed.
-- After the fix (InvoiceID = "<InvoiceNumber>::<SUPPLIER>"), each affected
-- invoice ends up with exactly one legacy row (bare UUID InvoiceID) sitting
-- alongside one fresh row (composite InvoiceID). This migration merges them.
--
-- IMPORTANT: prx_invoices_completed.invoice_id has ON DELETE CASCADE back to
-- prx-invoices.id -- deleting a legacy row WITHOUT first re-pointing its
-- completion rows would silently wipe that scan/print history, which would
-- make already-printed items look "not completed" again. Steps 1-2 must run
-- before step 3.
--
-- Run the preview SELECT below by itself first to see exactly what will be
-- affected before running the transaction.

-- ============================================================
-- PREVIEW (read-only, run first)
-- ============================================================
-- SELECT
--   old_row."id" AS old_id, new_row."id" AS new_id,
--   old_row."InvoiceID" AS old_invoice_id, new_row."InvoiceID" AS new_invoice_id,
--   old_row."InvoiceNumber", old_row."SupplierName",
--   old_row."TotalItems" AS old_total_items, new_row."TotalItems" AS new_total_items,
--   old_row."StatusChangedOn" AS old_status_changed_on, new_row."StatusChangedOn" AS new_status_changed_on,
--   old_row."LastProcessedAt" AS old_last_processed_at, new_row."LastProcessedAt" AS new_last_processed_at
-- FROM "prx-invoices" old_row
-- JOIN "prx-invoices" new_row
--   ON old_row."InvoiceNumber" = new_row."InvoiceNumber"
--  AND old_row."SupplierName" = new_row."SupplierName"
--  AND old_row."id" <> new_row."id"
-- WHERE old_row."InvoiceID" NOT LIKE '%::%'
--   AND new_row."InvoiceID" LIKE '%::%';

-- ============================================================
-- CLEANUP (destructive -- review the preview above first)
-- ============================================================
BEGIN;

-- 1) Re-point completion rows from the legacy invoice id to the surviving
--    (composite-key) invoice id, skipping any that would collide with a
--    completion record that already exists under the new id for the same
--    ndc+upc (idx_unique_invoice_item would otherwise reject the update).
WITH pairs AS (
  SELECT
    old_row."id" AS old_id,
    new_row."id" AS new_id
  FROM "prx-invoices" old_row
  JOIN "prx-invoices" new_row
    ON old_row."InvoiceNumber" = new_row."InvoiceNumber"
   AND old_row."SupplierName" = new_row."SupplierName"
   AND old_row."id" <> new_row."id"
  WHERE old_row."InvoiceID" NOT LIKE '%::%'
    AND new_row."InvoiceID" LIKE '%::%'
)
UPDATE "prx_invoices_completed" c
SET "invoice_id" = p.new_id
FROM pairs p
WHERE c."invoice_id" = p.old_id
  AND NOT EXISTS (
    SELECT 1 FROM "prx_invoices_completed" c2
    WHERE c2."invoice_id" = p.new_id
      AND c2."ndc" = c."ndc"
      AND c2."upc" = c."upc"
  );

-- 2) Any completion rows still pointing at a legacy id at this point are
--    exact duplicates of a completion that already exists under the new id
--    (same ndc+upc) -- delete them explicitly so the cascade in step 3 has
--    nothing left to remove and this script has a clear audit trail.
WITH pairs AS (
  SELECT old_row."id" AS old_id
  FROM "prx-invoices" old_row
  JOIN "prx-invoices" new_row
    ON old_row."InvoiceNumber" = new_row."InvoiceNumber"
   AND old_row."SupplierName" = new_row."SupplierName"
   AND old_row."id" <> new_row."id"
  WHERE old_row."InvoiceID" NOT LIKE '%::%'
    AND new_row."InvoiceID" LIKE '%::%'
)
DELETE FROM "prx_invoices_completed" c
USING pairs p
WHERE c."invoice_id" = p.old_id;

-- 3) Delete the now-empty legacy invoice rows.
DELETE FROM "prx-invoices" old_row
WHERE old_row."InvoiceID" NOT LIKE '%::%'
  AND EXISTS (
    SELECT 1 FROM "prx-invoices" new_row
    WHERE new_row."InvoiceNumber" = old_row."InvoiceNumber"
      AND new_row."SupplierName" = old_row."SupplierName"
      AND new_row."InvoiceID" LIKE '%::%'
  );

COMMIT;

-- ============================================================
-- VERIFY (should return 0 rows)
-- ============================================================
-- SELECT "InvoiceNumber", "SupplierName", COUNT(*) AS row_count
-- FROM "prx-invoices"
-- GROUP BY "InvoiceNumber", "SupplierName"
-- HAVING COUNT(*) > 1
-- ORDER BY row_count DESC;
