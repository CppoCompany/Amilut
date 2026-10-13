-- =============================================================================
-- 021_import_account_files_order_or_ccf
-- Re-points `import_account_files` from the shipping case (`mbl`, via
-- `account_id`, see 017) to EITHER an order (`orders.id`) OR a Customs
-- Clearance File (`customs_clearance_files.id`) — never both. Paperwork was
-- wrongly modeled as belonging to a shipping case; it actually belongs to
-- the Order or CCF it was filed under (opening an Order or a CCF must show
-- exactly its own paperwork, nothing scoped by shipping case).
--
-- `account_id` is dropped outright (unlike 016's choice to leave
-- `order_account` in place) — there is no reason to keep a column nothing
-- will ever read again once `order_id`/`ccf_id` exist.
--
-- Existing rows are TRUNCATEd rather than backfilled: an MBL case can have
-- many orders underneath it (via `hbl`), so there is no single correct
-- `order_id`/`ccf_id` to assign an old `account_id`-scoped row to. This is
-- pre-production dev/seed data — same precedent as
-- 016_remove_legacy_shipment_cases.sql (wipe instead of guessing) during the
-- MBL/HBL pivot.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: the column swap only runs once (guarded on `order_id` not
-- existing yet); CREATE INDEX IF NOT EXISTS is safe to re-run unconditionally.
-- =============================================================================

DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'import_account_files' AND column_name = 'order_id'
    ) THEN
        TRUNCATE TABLE import_account_files;

        ALTER TABLE import_account_files DROP CONSTRAINT IF EXISTS import_account_files_mbl_id_fkey;
        ALTER TABLE import_account_files DROP COLUMN IF EXISTS account_id;

        ALTER TABLE import_account_files
            ADD COLUMN order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
            ADD COLUMN ccf_id   INTEGER REFERENCES customs_clearance_files(id) ON DELETE CASCADE;

        -- num_nonnulls() is the standard Postgres idiom for "exactly N of
        -- these columns are non-null".
        ALTER TABLE import_account_files
            ADD CONSTRAINT import_account_files_exactly_one_context_chk
            CHECK (num_nonnulls(order_id, ccf_id) = 1);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS import_account_files_order_id_idx ON import_account_files (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS import_account_files_ccf_id_idx   ON import_account_files (ccf_id)   WHERE ccf_id IS NOT NULL;
