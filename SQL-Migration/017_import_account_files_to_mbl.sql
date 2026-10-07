-- =============================================================================
-- 017_import_account_files_to_mbl
-- Re-points `import_account_files.account_id` from the legacy `order_account`
-- table to `mbl(id)` — the "מספר תיק" of the MBL/HBL workflow (see 015).
--
-- 016 emptied `order_account` (and, through ON DELETE CASCADE, this table), so
-- while the FK still targeted `order_account` no file could be filed at all:
-- every upload failed with "Import case (account) N not found". Paperwork is
-- now filed under the MBL case; deleting the MBL deletes its file rows.
--
-- The column keeps its `account_id` name — only its target changes.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: the old FK is dropped only while it exists, and the new one is
-- added only while it is missing.
-- =============================================================================

ALTER TABLE import_account_files
    DROP CONSTRAINT IF EXISTS import_account_files_account_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'import_account_files_mbl_id_fkey'
           AND conrelid = 'import_account_files'::regclass
    ) THEN
        -- Rows left over from the old workflow hold `order_account` ids, which
        -- mean nothing as MBL ids (016 already cascade-deleted them; this only
        -- matters if 016 was skipped).
        DELETE FROM import_account_files;

        ALTER TABLE import_account_files
            ADD CONSTRAINT import_account_files_mbl_id_fkey
            FOREIGN KEY (account_id) REFERENCES mbl(id) ON DELETE CASCADE;
    END IF;
END
$$;
