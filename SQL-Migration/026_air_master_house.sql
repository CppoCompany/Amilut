-- =============================================================================
-- 026_air_master_house
-- Extends the master (`mbl`) / house (`hbl`) tables for air freight: the
-- master becomes the MAWB, the house the HAWB. Table names stay generic so
-- the sea workflow, its API and its generated client types are unchanged.
--
-- mbl (MAWB when shipping_type = 'air'):
--   air_method             — direct | consolidation | back_to_back. The old
--                            CHECK `mbl_sea_method_matches_shipping_type` is
--                            replaced by `mbl_method_matches_shipping_type`:
--                            sea ⇒ sea_method set, air_method NULL (unchanged
--                            for sea); air ⇒ sea_method NULL. `air_method` is
--                            required for new air rows by the server, not the
--                            DB, so any air row created before this migration
--                            stays valid.
--   departure_airport_code — IATA code (format-checked only: no world list).
--   destination_airport_code → airport(code); the server only accepts
--                            airports flagged `is_import_destination`.
--   cargo_terminal_id → cargo_terminal(id) / cargo_terminal_other (free text
--                            for exceptions) — at most one of the two.
--   pieces, calculated/approved chargeable weight, the rule snapshot used
--   (volumetric_divisor, weight_rounding_step_kg, weight_rounding_mode) and
--   the override marker (chargeable_weight_overridden/_by/_at).
--   special_handling_codes — IATA SHC codes as text[] (e.g. DGR, PER).
--   Air-only columns must be NULL on sea rows (CHECK mbl_air_columns_air_only).
--   Air MAWB numbers are unique (normalised); sea numbers are not touched —
--   existing sea data already contains a duplicate.
--
-- hbl (HAWB when shipping_type = 'air'):
--   shipping_type          — copied from the master at creation (backfilled
--                            here); needed because an air HAWB may exist
--                            before it has a MAWB.
--   mbl_id / sequence_number become nullable. CHECK hbl_sea_requires_master
--                            keeps every sea HBL attached to an MBL; CHECK
--                            hbl_sequence_iff_master keeps the ordinal set
--                            exactly while a master is set.
--   is_master_mirror       — the hidden house auto-created for a Direct MAWB
--                            (orders / CCF / arrivals hang off houses). Never
--                            a real HAWB document; at most one per master.
--   handler_user_id        — who created the house (notification recipient
--                            for its CCF when it has no master yet).
--   pieces, chargeable weight columns (as on mbl), special_handling_codes.
--   Real air HAWB numbers are unique system-wide (trimmed, upper-cased);
--   mirrors and blank numbers are excluded.
--
-- mbl_flight_leg       — the MAWB's routing, one row per leg (ETD/ETA/ATD/ATA).
-- hbl_piece_dimension  — piece dimension lines used for volumetric weight.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: every ALTER uses IF [NOT] EXISTS or a pg_constraint guard.
-- =============================================================================

-- ── mbl: air columns ─────────────────────────────────────────────────────────
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS air_method               VARCHAR(20);
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS departure_airport_code   VARCHAR(3);
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS destination_airport_code VARCHAR(3) REFERENCES airport(code);
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS cargo_terminal_id        INTEGER    REFERENCES cargo_terminal(id);
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS cargo_terminal_other     VARCHAR(200);
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS pieces                   INTEGER;
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS calculated_chargeable_weight_kg NUMERIC(10, 2);
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS approved_chargeable_weight_kg   NUMERIC(10, 2);
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS volumetric_divisor       INTEGER;
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS weight_rounding_step_kg  NUMERIC(6, 3);
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS weight_rounding_mode     VARCHAR(10);
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS chargeable_weight_overridden    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS chargeable_weight_override_by   INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS chargeable_weight_override_at   TIMESTAMPTZ;
ALTER TABLE mbl ADD COLUMN IF NOT EXISTS special_handling_codes   TEXT[];

DO
$$
BEGIN
    ALTER TABLE mbl DROP CONSTRAINT IF EXISTS mbl_sea_method_matches_shipping_type;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'mbl_method_matches_shipping_type' AND conrelid = 'mbl'::regclass) THEN
        ALTER TABLE mbl ADD CONSTRAINT mbl_method_matches_shipping_type CHECK (
            (shipping_type = 'sea' AND sea_method IS NOT NULL AND air_method IS NULL) OR
            (shipping_type = 'air' AND sea_method IS NULL)
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'mbl_air_method_check' AND conrelid = 'mbl'::regclass) THEN
        ALTER TABLE mbl ADD CONSTRAINT mbl_air_method_check
            CHECK (air_method IN ('direct', 'consolidation', 'back_to_back'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'mbl_air_columns_air_only' AND conrelid = 'mbl'::regclass) THEN
        ALTER TABLE mbl ADD CONSTRAINT mbl_air_columns_air_only CHECK (
            shipping_type = 'air' OR (
                departure_airport_code IS NULL AND destination_airport_code IS NULL AND
                cargo_terminal_id IS NULL AND cargo_terminal_other IS NULL AND pieces IS NULL AND
                calculated_chargeable_weight_kg IS NULL AND approved_chargeable_weight_kg IS NULL AND
                special_handling_codes IS NULL
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'mbl_departure_airport_format' AND conrelid = 'mbl'::regclass) THEN
        ALTER TABLE mbl ADD CONSTRAINT mbl_departure_airport_format
            CHECK (departure_airport_code ~ '^[A-Z]{3}$');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'mbl_single_cargo_terminal' AND conrelid = 'mbl'::regclass) THEN
        ALTER TABLE mbl ADD CONSTRAINT mbl_single_cargo_terminal
            CHECK (num_nonnulls(cargo_terminal_id, cargo_terminal_other) <= 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'mbl_air_quantities_check' AND conrelid = 'mbl'::regclass) THEN
        ALTER TABLE mbl ADD CONSTRAINT mbl_air_quantities_check CHECK (
            (pieces IS NULL OR pieces > 0) AND
            (calculated_chargeable_weight_kg IS NULL OR calculated_chargeable_weight_kg >= 0) AND
            (approved_chargeable_weight_kg IS NULL OR approved_chargeable_weight_kg >= 0) AND
            (weight_rounding_mode IS NULL OR weight_rounding_mode IN ('up', 'nearest'))
        );
    END IF;

    -- Unique air MAWB numbers. Stop (rather than silently skip) if data that
    -- predates this migration already violates it — that needs a human.
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'mbl_air_number_unique_idx') THEN
        IF EXISTS (
            SELECT 1 FROM mbl
             WHERE shipping_type = 'air' AND btrim(COALESCE(mbl_number, '')) <> ''
             GROUP BY upper(btrim(mbl_number)) HAVING count(*) > 1
        ) THEN
            RAISE EXCEPTION '026: duplicate air MAWB numbers exist in mbl — resolve them before re-running';
        END IF;
        CREATE UNIQUE INDEX mbl_air_number_unique_idx ON mbl (upper(btrim(mbl_number)))
         WHERE shipping_type = 'air' AND btrim(COALESCE(mbl_number, '')) <> '';
    END IF;
END
$$;

-- ── hbl: nullable master + air columns ──────────────────────────────────────
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS shipping_type    VARCHAR(10);
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS is_master_mirror BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS handler_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS pieces           INTEGER;
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS calculated_chargeable_weight_kg NUMERIC(10, 2);
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS approved_chargeable_weight_kg   NUMERIC(10, 2);
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS volumetric_divisor       INTEGER;
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS weight_rounding_step_kg  NUMERIC(6, 3);
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS weight_rounding_mode     VARCHAR(10);
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS chargeable_weight_overridden    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS chargeable_weight_override_by   INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS chargeable_weight_override_at   TIMESTAMPTZ;
ALTER TABLE hbl ADD COLUMN IF NOT EXISTS special_handling_codes   TEXT[];

-- Every house that exists today hangs off a master: copy its mode down.
UPDATE hbl h SET shipping_type = m.shipping_type
  FROM mbl m
 WHERE m.id = h.mbl_id AND h.shipping_type IS NULL;

ALTER TABLE hbl ALTER COLUMN shipping_type   SET NOT NULL;
ALTER TABLE hbl ALTER COLUMN mbl_id          DROP NOT NULL;
ALTER TABLE hbl ALTER COLUMN sequence_number DROP NOT NULL;

DO
$$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'hbl_shipping_type_check' AND conrelid = 'hbl'::regclass) THEN
        ALTER TABLE hbl ADD CONSTRAINT hbl_shipping_type_check CHECK (shipping_type IN ('sea', 'air'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'hbl_sea_requires_master' AND conrelid = 'hbl'::regclass) THEN
        ALTER TABLE hbl ADD CONSTRAINT hbl_sea_requires_master
            CHECK (shipping_type = 'air' OR mbl_id IS NOT NULL);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'hbl_sequence_iff_master' AND conrelid = 'hbl'::regclass) THEN
        ALTER TABLE hbl ADD CONSTRAINT hbl_sequence_iff_master
            CHECK ((mbl_id IS NULL) = (sequence_number IS NULL));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'hbl_mirror_is_air_with_master' AND conrelid = 'hbl'::regclass) THEN
        ALTER TABLE hbl ADD CONSTRAINT hbl_mirror_is_air_with_master
            CHECK (NOT is_master_mirror OR (shipping_type = 'air' AND mbl_id IS NOT NULL));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'hbl_air_columns_air_only' AND conrelid = 'hbl'::regclass) THEN
        ALTER TABLE hbl ADD CONSTRAINT hbl_air_columns_air_only CHECK (
            shipping_type = 'air' OR (
                pieces IS NULL AND calculated_chargeable_weight_kg IS NULL AND
                approved_chargeable_weight_kg IS NULL AND special_handling_codes IS NULL
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'hbl_air_quantities_check' AND conrelid = 'hbl'::regclass) THEN
        ALTER TABLE hbl ADD CONSTRAINT hbl_air_quantities_check CHECK (
            (pieces IS NULL OR pieces > 0) AND
            (calculated_chargeable_weight_kg IS NULL OR calculated_chargeable_weight_kg >= 0) AND
            (approved_chargeable_weight_kg IS NULL OR approved_chargeable_weight_kg >= 0) AND
            (weight_rounding_mode IS NULL OR weight_rounding_mode IN ('up', 'nearest'))
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'hbl_air_number_unique_idx') THEN
        IF EXISTS (
            SELECT 1 FROM hbl
             WHERE shipping_type = 'air' AND NOT is_master_mirror AND btrim(COALESCE(hbl_number, '')) <> ''
             GROUP BY upper(btrim(hbl_number)) HAVING count(*) > 1
        ) THEN
            RAISE EXCEPTION '026: duplicate air HAWB numbers exist in hbl — resolve them before re-running';
        END IF;
        CREATE UNIQUE INDEX hbl_air_number_unique_idx ON hbl (upper(btrim(hbl_number)))
         WHERE shipping_type = 'air' AND NOT is_master_mirror AND btrim(COALESCE(hbl_number, '')) <> '';
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS hbl_single_mirror_per_master_idx ON hbl (mbl_id) WHERE is_master_mirror;
CREATE INDEX IF NOT EXISTS hbl_unassigned_air_idx ON hbl (id) WHERE mbl_id IS NULL;

-- ── Flight legs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mbl_flight_leg (
    id             SERIAL       PRIMARY KEY,
    mbl_id         INTEGER      NOT NULL REFERENCES mbl(id) ON DELETE CASCADE,
    leg_no         INTEGER      NOT NULL CHECK (leg_no >= 1),
    flight_number  VARCHAR(20),
    from_airport   VARCHAR(3)   CHECK (from_airport ~ '^[A-Z]{3}$'),
    to_airport     VARCHAR(3)   CHECK (to_airport ~ '^[A-Z]{3}$'),
    etd            TIMESTAMPTZ,
    eta            TIMESTAMPTZ,
    atd            TIMESTAMPTZ,
    ata            TIMESTAMPTZ,
    UNIQUE (mbl_id, leg_no)
);

-- ── Piece dimensions (volumetric weight) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS hbl_piece_dimension (
    id           SERIAL        PRIMARY KEY,
    hbl_id       INTEGER       NOT NULL REFERENCES hbl(id) ON DELETE CASCADE,
    piece_count  INTEGER       NOT NULL CHECK (piece_count > 0),
    length_cm    NUMERIC(8, 2) NOT NULL CHECK (length_cm > 0),
    width_cm     NUMERIC(8, 2) NOT NULL CHECK (width_cm > 0),
    height_cm    NUMERIC(8, 2) NOT NULL CHECK (height_cm > 0)
);

CREATE INDEX IF NOT EXISTS hbl_piece_dimension_hbl_id_idx ON hbl_piece_dimension (hbl_id);
