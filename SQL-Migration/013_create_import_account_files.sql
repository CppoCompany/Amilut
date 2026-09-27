-- =============================================================================
-- 013_create_import_account_files
-- Creates the `import_account_files` table inside the `Amilut` database: one
-- row per document uploaded to an import case (`order_account`).
--
-- The file's descriptor lives in a single JSONB column (`data`) rather than
-- fixed columns, because the set of attributes an uploaded document carries
-- (document type, original file name, size, MIME type, relative storage path,
-- uploadedAt, …) is still being shaped by the UI. The binary itself is NOT
-- stored here — only the metadata pointing at it on disk. Deleting the case
-- deletes its file rows.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS / IF NOT EXISTS on the index.
-- =============================================================================

-- ---- import_account_files -------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_account_files (
    id          SERIAL       PRIMARY KEY,
    account_id  INTEGER      NOT NULL
        REFERENCES order_account(id) ON DELETE CASCADE,

    -- Descriptor of the uploaded document, e.g.
    -- {"documentType": "...", "fileName": "...", "size": 12345,
    --  "mimeType": "application/pdf", "relativePath": "...", "uploadedAt": "..."}
    data        JSONB        NOT NULL,

    -- bookkeeping
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_account_files_account_id_idx ON import_account_files (account_id);
