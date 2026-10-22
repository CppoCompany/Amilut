-- =============================================================================
-- 024_create_line_item_notes
-- Free-text notes written on the classification ("סיווג") screen against one
-- supplier-invoice line. A line can collect several notes over time; each
-- keeps its author and timestamp so the popup can show the history.
--
-- Lines have no table of their own — they live in
-- `import_account_files.data.lineItems[]` (013/021) — so a note names its
-- line by the file row + the line's position, exactly like the
-- classification save does.
--
--   file_id    — → import_account_files(id). ON DELETE CASCADE: deleting
--                the file removes its lines, and with them their notes.
--   line_index — position inside that file's `lineItems` (0-based).
--   created_by — → users(id), nullable, ON DELETE SET NULL: deleting a user
--                keeps the notes they wrote.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS throughout.
-- =============================================================================

CREATE TABLE IF NOT EXISTS line_item_notes (
    id          SERIAL       PRIMARY KEY,
    file_id     INTEGER      NOT NULL REFERENCES import_account_files(id) ON DELETE CASCADE,
    line_index  INTEGER      NOT NULL CHECK (line_index >= 0),
    body        TEXT         NOT NULL,
    created_by  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS line_item_notes_line_idx ON line_item_notes (file_id, line_index);
