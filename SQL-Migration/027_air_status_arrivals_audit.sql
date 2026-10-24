-- =============================================================================
-- 027_air_status_arrivals_audit
-- Independent status tracks, HAWB arrival events and the audit trail.
--
-- Status tracks (a shared design — implemented for air first; every column is
-- nullable and sea rows simply leave it NULL, so `mbl.status` and the sea
-- workflow behave exactly as before):
--   mbl.shipment_status        booking_confirmed | departed | in_transit | arrived
--   mbl.shipment_status_source manual | auto — `auto` when the server set it
--                              from a flight-leg ATD/ATA, so a later leg
--                              correction may move it again.
--   hbl.document_status        pending | under_review | missing_information | approved
--   (customs_clearance_files.clearance_status is added in 028.)
--
-- status_history          — one row per change of any track (from → to, who,
--                           when, manual/auto/correction, optional reason).
-- hbl_arrival             — one row per arrival event of a HAWB: flight,
--                           arrival date, pieces received. A wrong row is
--                           voided (void_* columns), never deleted. A row that
--                           takes the total above the expected pieces must be
--                           an explicit override with a reason.
-- hbl_master_link_history — every link / unlink / relink of a HAWB to a MAWB
--                           (previous and new MAWB, who, when, reason).
-- audit_log               — other exceptional actions (chargeable-weight
--                           overrides, arrival overrides and voids) with the
--                           before/after values.
--
-- History is append-only: triggers reject UPDATE and DELETE on status_history,
-- hbl_master_link_history and audit_log, and on hbl_arrival allow only the
-- one-time void of a row. History rows keep plain ids (no FK) so they outlive
-- the rows they describe.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: IF NOT EXISTS / pg_constraint guards / CREATE OR REPLACE.
-- =============================================================================

ALTER TABLE mbl ADD COLUMN IF NOT EXISTS shipment_status        VARCHAR(20);
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS shipment_status_source VARCHAR(10);
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS document_status        VARCHAR(30);

DO
$$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'mbl_shipment_status_check' AND conrelid = 'mbl'::regclass) THEN
        ALTER TABLE mbl ADD CONSTRAINT mbl_shipment_status_check CHECK (
            (shipment_status IS NULL) = (shipment_status_source IS NULL) AND
            (shipment_status IS NULL OR shipment_status IN ('booking_confirmed', 'departed', 'in_transit', 'arrived')) AND
            (shipment_status_source IS NULL OR shipment_status_source IN ('manual', 'auto'))
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'hbl_document_status_check' AND conrelid = 'hbl'::regclass) THEN
        ALTER TABLE hbl ADD CONSTRAINT hbl_document_status_check CHECK (
            document_status IN ('pending', 'under_review', 'missing_information', 'approved')
        );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS status_history (
    id           BIGSERIAL    PRIMARY KEY,
    entity_type  VARCHAR(10)  NOT NULL CHECK (entity_type IN ('mbl', 'hbl', 'ccf')),
    entity_id    INTEGER      NOT NULL,
    track        VARCHAR(20)  NOT NULL CHECK (track IN ('shipment', 'document', 'clearance')),
    from_value   VARCHAR(30),
    to_value     VARCHAR(30),
    source       VARCHAR(12)  NOT NULL CHECK (source IN ('manual', 'auto', 'correction')),
    reason       VARCHAR(500),
    changed_by   INTEGER      REFERENCES users(id),
    changed_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (source <> 'correction' OR btrim(COALESCE(reason, '')) <> '')
);

CREATE INDEX IF NOT EXISTS status_history_entity_idx ON status_history (entity_type, entity_id, changed_at);

CREATE TABLE IF NOT EXISTS hbl_arrival (
    id               SERIAL       PRIMARY KEY,
    hbl_id           INTEGER      NOT NULL REFERENCES hbl(id) ON DELETE RESTRICT,
    flight_number    VARCHAR(20)  NOT NULL,
    arrival_date     DATE         NOT NULL,
    pieces_received  INTEGER      NOT NULL CHECK (pieces_received > 0),
    notes            VARCHAR(500),
    is_override      BOOLEAN      NOT NULL DEFAULT false,
    override_reason  VARCHAR(500),
    created_by       INTEGER      REFERENCES users(id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    voided_at        TIMESTAMPTZ,
    voided_by        INTEGER      REFERENCES users(id),
    void_reason      VARCHAR(500),
    CHECK (NOT is_override OR btrim(COALESCE(override_reason, '')) <> ''),
    CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS hbl_arrival_hbl_id_idx ON hbl_arrival (hbl_id);

CREATE TABLE IF NOT EXISTS hbl_master_link_history (
    id               BIGSERIAL    PRIMARY KEY,
    hbl_id           INTEGER      NOT NULL,
    previous_mbl_id  INTEGER,
    new_mbl_id       INTEGER,
    is_correction    BOOLEAN      NOT NULL DEFAULT false,
    reason           VARCHAR(500),
    changed_by       INTEGER      REFERENCES users(id),
    changed_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (NOT is_correction OR btrim(COALESCE(reason, '')) <> '')
);

CREATE INDEX IF NOT EXISTS hbl_master_link_history_hbl_idx ON hbl_master_link_history (hbl_id, changed_at);

CREATE TABLE IF NOT EXISTS audit_log (
    id           BIGSERIAL    PRIMARY KEY,
    entity_type  VARCHAR(10)  NOT NULL CHECK (entity_type IN ('mbl', 'hbl', 'ccf')),
    entity_id    INTEGER      NOT NULL,
    action       VARCHAR(40)  NOT NULL,
    before_value JSONB,
    after_value  JSONB,
    reason       VARCHAR(500),
    changed_by   INTEGER      REFERENCES users(id),
    changed_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id, changed_at);

-- ── Append-only guards ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_history_change() RETURNS trigger
LANGUAGE plpgsql AS
$$
BEGIN
    RAISE EXCEPTION 'History table % is append-only (% rejected)', TG_TABLE_NAME, TG_OP;
END
$$;

-- An arrival row may be updated exactly once, and only to void it.
CREATE OR REPLACE FUNCTION guard_hbl_arrival_change() RETURNS trigger
LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'hbl_arrival rows cannot be deleted — void them instead';
    END IF;
    IF OLD.voided_at IS NOT NULL
       OR NEW.voided_at IS NULL
       OR (NEW.id, NEW.hbl_id, NEW.flight_number, NEW.arrival_date, NEW.pieces_received, NEW.notes,
           NEW.is_override, NEW.override_reason, NEW.created_by, NEW.created_at)
          IS DISTINCT FROM
          (OLD.id, OLD.hbl_id, OLD.flight_number, OLD.arrival_date, OLD.pieces_received, OLD.notes,
           OLD.is_override, OLD.override_reason, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION 'hbl_arrival rows are immutable except for a one-time void';
    END IF;
    RETURN NEW;
END
$$;

DO
$$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['status_history', 'hbl_master_link_history', 'audit_log'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_append_only') THEN
            EXECUTE format(
                'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_history_change()',
                t || '_append_only', t);
        END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'hbl_arrival_guard') THEN
        CREATE TRIGGER hbl_arrival_guard BEFORE UPDATE OR DELETE ON hbl_arrival
            FOR EACH ROW EXECUTE FUNCTION guard_hbl_arrival_change();
    END IF;
END
$$;
