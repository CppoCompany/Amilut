-- =============================================================================
-- 018_mbl_handler_and_status
-- Adds two columns to `mbl` (the MBL/HBL shipping case):
--
--   handler_user_id  → users.id  — the signed-in user who opened the case
--                      (stamped from the JWT by MblService.create, exactly like
--                      orders.handler_user_id). Drives "התיקים שלי".
--   status           — lifecycle of the case: open → in_release → released →
--                      closed. Drives "תיקים בהתרה" (status = 'in_release').
--                      Must stay in sync with `MblStatus` in
--                      server/src/mbl/mbl.enums.ts.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, and the
-- CHECK constraint is only added when pg_constraint does not already have it.
-- =============================================================================

ALTER TABLE mbl ADD COLUMN IF NOT EXISTS handler_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE mbl ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'mbl_status_check'
           AND conrelid = 'mbl'::regclass
    ) THEN
        ALTER TABLE mbl
            ADD CONSTRAINT mbl_status_check
            CHECK (status IN ('open', 'in_release', 'released', 'closed'));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS mbl_handler_user_id_idx ON mbl (handler_user_id);
CREATE INDEX IF NOT EXISTS mbl_status_idx          ON mbl (status);
