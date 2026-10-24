-- =============================================================================
-- 025_air_reference_tables
-- Lookup tables for the air-freight import workflow. Nothing here touches an
-- existing table, so sea freight is unaffected.
--
--   airport          — airports an air shipment can depart from / arrive at.
--                      Only airports flagged `is_import_destination` may be a
--                      MAWB's destination; `order_destination` maps an airport
--                      to the matching `orders.destination` code, so the order
--                      form's existing enum and the air model agree without
--                      either hard-coding the other. Seeded with TLV only.
--   cargo_terminal   — cargo terminals that hold arriving air cargo. A MAWB
--                      picks one, or records an exceptional value as free text
--                      (`mbl.cargo_terminal_other`, migration 026). `code` is
--                      nullable: the official terminal codes have not been
--                      verified yet, so the seed rows carry names only.
--   air_weight_rule  — volumetric divisor + rounding used to calculate
--                      chargeable weight. The row with `airline_prefix IS
--                      NULL` is the default (6000, round up to 0.5 kg).
--                      Carrier-specific rows (3-digit IATA airline prefix) are
--                      added only once a carrier's rule has been verified —
--                      none are seeded.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: CREATE ... IF NOT EXISTS, and seeds use ON CONFLICT DO NOTHING /
-- NOT EXISTS guards so re-runs never duplicate or overwrite rows.
-- =============================================================================

CREATE TABLE IF NOT EXISTS airport (
    code                   VARCHAR(3)   PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
    name_he                VARCHAR(200) NOT NULL,
    name_en                VARCHAR(200) NOT NULL,
    is_import_destination  BOOLEAN      NOT NULL DEFAULT false,
    order_destination      VARCHAR(30)  UNIQUE
        CHECK (order_destination IN ('ashdod', 'south_port', 'haifa', 'ben_gurion')),
    is_active              BOOLEAN      NOT NULL DEFAULT true
);

INSERT INTO airport (code, name_he, name_en, is_import_destination, order_destination)
VALUES ('TLV', 'נמל התעופה בן גוריון', 'Ben Gurion Airport', true, 'ben_gurion')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS cargo_terminal (
    id            SERIAL       PRIMARY KEY,
    airport_code  VARCHAR(3)   NOT NULL REFERENCES airport(code),
    code          VARCHAR(20)  UNIQUE,
    name_he       VARCHAR(200) NOT NULL,
    name_en       VARCHAR(200) NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    sort_order    INTEGER      NOT NULL DEFAULT 0,
    UNIQUE (airport_code, name_en)
);

-- Names confirmed by the business; `code` deliberately left NULL until the
-- official terminal codes are verified (set them with an UPDATE then).
INSERT INTO cargo_terminal (airport_code, name_he, name_en, sort_order)
VALUES ('TLV', 'ממ"ן', 'Maman', 1),
       ('TLV', 'סוויספורט', 'Swissport', 2)
ON CONFLICT (airport_code, name_en) DO NOTHING;

CREATE TABLE IF NOT EXISTS air_weight_rule (
    id                  SERIAL        PRIMARY KEY,
    airline_prefix      VARCHAR(3)    UNIQUE CHECK (airline_prefix ~ '^[0-9]{3}$'),
    volumetric_divisor  INTEGER       NOT NULL CHECK (volumetric_divisor > 0),
    rounding_step_kg    NUMERIC(6, 3) NOT NULL CHECK (rounding_step_kg > 0),
    rounding_mode       VARCHAR(10)   NOT NULL CHECK (rounding_mode IN ('up', 'nearest')),
    notes               VARCHAR(500),
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- At most one default row (airline_prefix IS NULL). UNIQUE alone allows many NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS air_weight_rule_single_default_idx
    ON air_weight_rule ((airline_prefix IS NULL)) WHERE airline_prefix IS NULL;

INSERT INTO air_weight_rule (airline_prefix, volumetric_divisor, rounding_step_kg, rounding_mode, notes)
SELECT NULL, 6000, 0.5, 'up', 'Default rule — not carrier-specific'
 WHERE NOT EXISTS (SELECT 1 FROM air_weight_rule WHERE airline_prefix IS NULL);
