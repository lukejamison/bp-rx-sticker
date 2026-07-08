-- Migration: Skip no-op updates on "prx-invoices"
--
-- Background: the n8n "PRX Invoice Detail" workflow re-syncs a rolling window
-- of recent invoices on a schedule, and upserts every invoice it sees on
-- every run -- even when an invoice's data hasn't changed at all since the
-- last sync. Today that means "prx-invoices" gets a real UPDATE (bumping
-- modified_at) for the same unchanged invoice over and over.
--
-- This adds a BEFORE UPDATE trigger that compares the incoming row to what's
-- already stored (ignoring bookkeeping columns) and cancels the write
-- entirely when nothing meaningful actually changed. Net effect, regardless
-- of what writes to this table (n8n, a script, a manual fix):
--   - New invoice                -> INSERT happens normally (trigger doesn't apply)
--   - Existing invoice, changed  -> UPDATE happens normally
--   - Existing invoice, same     -> UPDATE is silently cancelled (0 rows touched)
--
-- Note: because the comparison intentionally ignores "LastProcessedAt" (see
-- below), a cancelled/no-op update also leaves LastProcessedAt and
-- modified_at untouched -- they keep reflecting the last time this invoice's
-- data actually changed, not just the last time a sync happened to see it.

CREATE OR REPLACE FUNCTION skip_noop_invoice_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Compare only the real PioneerRx data columns. "modified_at" and
    -- "LastProcessedAt" are sync/bookkeeping timestamps that are expected to
    -- differ on every run -- comparing them here would make this check
    -- always report "changed" and defeat the whole point.
    IF NEW."InvoiceNumber" IS NOT DISTINCT FROM OLD."InvoiceNumber"
       AND NEW."SupplierName" IS NOT DISTINCT FROM OLD."SupplierName"
       AND NEW."InvoiceDate" IS NOT DISTINCT FROM OLD."InvoiceDate"
       AND NEW."StatusChangedOn" IS NOT DISTINCT FROM OLD."StatusChangedOn"
       AND NEW."LocationID" IS NOT DISTINCT FROM OLD."LocationID"
       AND NEW."TotalItems" IS NOT DISTINCT FROM OLD."TotalItems"
       AND NEW."ItemDetails" IS NOT DISTINCT FROM OLD."ItemDetails"
    THEN
        -- Nothing meaningful changed -- cancel the write for this row.
        -- Returning NULL from a BEFORE UPDATE trigger tells Postgres to skip
        -- the update entirely (no row is touched, no other BEFORE triggers
        -- run for it, whatever else ran before us in this trigger chain is
        -- discarded too).
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_skip_noop_invoice_update ON "prx-invoices";
CREATE TRIGGER trg_skip_noop_invoice_update
    BEFORE UPDATE ON "prx-invoices"
    FOR EACH ROW
    EXECUTE FUNCTION skip_noop_invoice_update();

COMMENT ON FUNCTION skip_noop_invoice_update() IS
    'Cancels UPDATEs on prx-invoices when no real invoice data changed, so repeated syncs of an unchanged invoice are true no-ops.';

-- ============================================================
-- VERIFY (run manually after applying the migration)
-- ============================================================
-- 1) Re-run an UPDATE with identical data on some existing invoice and
--    confirm 0 rows are reported as updated, e.g.:
--
--      UPDATE "prx-invoices"
--      SET "SupplierName" = "SupplierName"
--      WHERE "InvoiceID" = '<pick an existing InvoiceID>';
--      -- psql should report: UPDATE 0
--
-- 2) Confirm a genuine change still goes through, e.g.:
--
--      UPDATE "prx-invoices"
--      SET "TotalItems" = "TotalItems" + 1
--      WHERE "InvoiceID" = '<pick an existing InvoiceID>';
--      -- psql should report: UPDATE 1
--      -- (undo with TotalItems - 1 afterwards if this was just a test)
