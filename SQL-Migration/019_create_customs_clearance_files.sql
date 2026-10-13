-- =============================================================================
-- 019_create_customs_clearance_files
-- Creates `customs_clearance_files` ("תיק סליקת מכס") — a file that can exist
-- standalone or be linked at most once to an existing shipping case (`mbl`).
--
--   file_number       — server-generated, e.g. "CCF1000", "CCF1001", ... built
--                       from customs_clearance_files_file_number_seq at INSERT
--                       time (nextval() is atomic — no read-then-insert race).
--                       UNIQUE, never written by the client.
--   shipment_file_id  — → mbl(id), the "Shipment File" in the feature spec.
--                       Nullable (a CCF can be standalone) and UNIQUE: Postgres
--                       allows any number of NULLs but at most one row per
--                       non-null value, which is exactly the 1:1 enforcement —
--                       a shipping case can have at most one CCF. ON DELETE
--                       SET NULL: deleting the mbl case unlinks its CCF rather
--                       than deleting it (the clearance file and its paperwork
--                       trail outlive the shipping case).
--   status            — lifecycle, default 'open'. Source of truth is
--                       `CcfStatus` in server/src/ccf/ccf.enums.ts.
--   created_by        — users.id, stamped from the JWT by CcfService.create.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: CREATE SEQUENCE/TABLE/INDEX IF NOT EXISTS throughout.
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS customs_clearance_files_file_number_seq START WITH 1000;

CREATE TABLE IF NOT EXISTS customs_clearance_files (
    id                SERIAL       PRIMARY KEY,

    file_number       VARCHAR(20)  NOT NULL UNIQUE,
    shipment_file_id  INTEGER      UNIQUE REFERENCES mbl(id) ON DELETE SET NULL,
    status            VARCHAR(20)  NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_by        INTEGER      NOT NULL REFERENCES users(id),

    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customs_clearance_files_shipment_file_id_idx ON customs_clearance_files (shipment_file_id);
CREATE INDEX IF NOT EXISTS customs_clearance_files_created_by_idx       ON customs_clearance_files (created_by);
