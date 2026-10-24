-- =============================================================================
-- 028_ccf_per_house
-- Lets a Customs Clearance File link to one house (`hbl`) instead of a whole
-- shipping case (`mbl`). Air freight opens one CCF per HAWB / importer; the
-- sea workflow keeps linking by `shipment_file_id` exactly as before (sea LCL
-- may move to per-house later, in its own migration, after reviewing data).
--
--   hbl_id            → hbl(id), nullable, UNIQUE (one CCF per house),
--                       ON DELETE SET NULL (same as shipment_file_id).
--   ccf_single_link   — at most one of shipment_file_id / hbl_id. Standalone
--                       CCFs (neither set) remain valid.
--   clearance_status  — the clearance status track: not_started |
--                       classification | compliance_check |
--                       ready_for_declaration. NULL for sea CCFs, set to
--                       not_started by the server when an air CCF is opened.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: IF NOT EXISTS / pg_constraint guards.
-- =============================================================================

ALTER TABLE customs_clearance_files
    ADD COLUMN IF NOT EXISTS hbl_id INTEGER REFERENCES hbl(id) ON DELETE SET NULL;
ALTER TABLE customs_clearance_files
    ADD COLUMN IF NOT EXISTS clearance_status VARCHAR(30);

DO
$$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'customs_clearance_files_hbl_id_key'
                      AND conrelid = 'customs_clearance_files'::regclass) THEN
        ALTER TABLE customs_clearance_files
            ADD CONSTRAINT customs_clearance_files_hbl_id_key UNIQUE (hbl_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'ccf_single_link'
                      AND conrelid = 'customs_clearance_files'::regclass) THEN
        ALTER TABLE customs_clearance_files
            ADD CONSTRAINT ccf_single_link CHECK (num_nonnulls(shipment_file_id, hbl_id) <= 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'ccf_clearance_status_check'
                      AND conrelid = 'customs_clearance_files'::regclass) THEN
        ALTER TABLE customs_clearance_files
            ADD CONSTRAINT ccf_clearance_status_check CHECK (
                clearance_status IN ('not_started', 'classification', 'compliance_check', 'ready_for_declaration')
            );
    END IF;
END
$$;
