-- =============================================================================
-- 015_create_mbl_hbl
-- Creates the new MBL (Master Bill of Lading) / HBL (House Bill of Lading)
-- workflow for "יצירת תיק שילוח" (Create New Shipping Case), alongside —
-- NOT replacing — the existing `order_account` flat-case model. Existing
-- `order_account` rows are untouched and keep working exactly as before;
-- this is a parallel structure for cases created through the new workflow.
--
-- Shape:
--   mbl            — the master document. One per shipping case created
--                     through the new flow. `sea_method` determines how many
--                     containers/HBLs it can have (see CHECK below).
--   mbl_container  — containers under an MBL. Only ever has more than one row
--                     for `sea_method = 'groupage_fcl'`; the other three sea
--                     methods keep their single container's data directly on
--                     `mbl` (container_number/container_seal_number), mirroring
--                     how `order_account` already stores a single container.
--   hbl            — one per customer "Internal B/L" under an MBL (or under
--                     one of its containers, for groupage_fcl). This is the
--                     unit orders attach to — see `orders.hbl_id` below.
--
-- `orders.case_id` (→ order_account.id) is untouched — orders created under
-- the new MBL/HBL flow attach via the new `orders.hbl_id` column instead, so
-- an order belongs to at most one of {case_id, hbl_id} in practice, though
-- nothing in the schema enforces that mutual exclusion (the two flows are
-- kept operationally separate at the application level).
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, CREATE
-- INDEX IF NOT EXISTS throughout.
-- =============================================================================

-- ---- mbl --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mbl (
    id                    SERIAL       PRIMARY KEY,

    shipping_type         VARCHAR(10)  NOT NULL CHECK (shipping_type IN ('sea', 'air')),
    -- NULL only for shipping_type = 'air' (air freight has no method step yet).
    sea_method            VARCHAR(20)  CHECK (sea_method IN ('fcl_fcl', 'fcl_lcl', 'lcl_lcl', 'groupage_fcl')),
    CONSTRAINT mbl_sea_method_matches_shipping_type CHECK (
        (shipping_type = 'air' AND sea_method IS NULL) OR
        (shipping_type = 'sea' AND sea_method IS NOT NULL)
    ),

    -- Set only for sea_method = 'fcl_lcl': picked once for the whole MBL and
    -- inherited by every HBL created under it (one customer, several HBLs).
    customer_id           INTEGER      REFERENCES customers(id),

    mbl_number            VARCHAR(50),
    booking_number        VARCHAR(50),
    vessel_name           VARCHAR(200),
    voyage_number         VARCHAR(50),
    port_of_loading       VARCHAR(100),
    port_of_discharge     VARCHAR(100),
    final_destination     VARCHAR(100),

    shipper_name          VARCHAR(200),
    shipper_address       VARCHAR(500),
    consignee_name        VARCHAR(200),
    consignee_address     VARCHAR(500),
    notify_party_name     VARCHAR(200),
    notify_party_address  VARCHAR(500),

    -- Single-container fields — used directly for fcl_fcl / fcl_lcl / lcl_lcl.
    -- groupage_fcl ignores these and uses `mbl_container` instead.
    container_number      VARCHAR(20),
    container_seal_number VARCHAR(30),
    cargo_description     VARCHAR(500),
    gross_weight_kg       NUMERIC(10, 2),
    volume_cbm            NUMERIC(10, 2),

    freight_terms         VARCHAR(10)  CHECK (freight_terms IN ('prepaid', 'collect')),
    -- Free text for now (e.g. "CY/CFS") — no existing enum covers this; ask
    -- before constraining it, since the reference image only shows one example.
    receipt_delivery_type VARCHAR(20),

    place_of_issue        VARCHAR(100),
    date_of_issue         DATE,
    carrier_name          VARCHAR(200),

    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mbl_customer_id_idx ON mbl (customer_id);

-- ---- mbl_container ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mbl_container (
    id                    SERIAL       PRIMARY KEY,
    mbl_id                INTEGER      NOT NULL REFERENCES mbl(id) ON DELETE CASCADE,

    container_number      VARCHAR(20),
    container_seal_number VARCHAR(30),
    -- Aggregate description for everything sharing this container, e.g.
    -- "CONSOLIDATED CARGO (3 PARTIES / 3 INTERNAL B/Ls)".
    cargo_description     VARCHAR(500),
    gross_weight_kg       NUMERIC(10, 2),
    volume_cbm            NUMERIC(10, 2),

    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mbl_container_mbl_id_idx ON mbl_container (mbl_id);

-- ---- hbl ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hbl (
    id                    SERIAL       PRIMARY KEY,
    mbl_id                INTEGER      NOT NULL REFERENCES mbl(id) ON DELETE CASCADE,
    -- Set only when the parent mbl.sea_method = 'groupage_fcl'.
    container_id          INTEGER      REFERENCES mbl_container(id) ON DELETE SET NULL,
    customer_id           INTEGER      NOT NULL REFERENCES customers(id),

    -- The "Internal B/L {N}" ordinal shown in the UI — a running count within
    -- this MBL (not per customer), matching the reference image's "3 PARTIES
    -- / 3 INTERNAL B/Ls" numbering.
    sequence_number       INTEGER      NOT NULL,

    -- System-generated internal reference (e.g. "IB-001") — formatted by the
    -- application from `id`, stored here so it's stable even if the format
    -- rule changes later.
    ibl_number            VARCHAR(20),
    -- Free text: the external house B/L number as issued by the forwarder
    -- (e.g. "HBL-ERZ-2026-001") — entered by staff, not auto-generated.
    hbl_number            VARCHAR(50),

    -- HBL-specific — NOT inherited from the MBL (the master's shipper is the
    -- consolidator; each HBL's shipper is that customer's actual supplier).
    shipper_name          VARCHAR(200),
    shipper_address       VARCHAR(500),
    consignee_name        VARCHAR(200),
    consignee_address     VARCHAR(500),
    notify_party_name     VARCHAR(200),
    notify_party_address  VARCHAR(500),

    cargo_description     VARCHAR(500),
    -- Free text ("120 cartons") rather than a bare number — unit varies per shipment.
    quantity               VARCHAR(100),
    gross_weight_kg       NUMERIC(10, 2),
    volume_cbm            NUMERIC(10, 2),

    remarks               VARCHAR(500),

    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

    UNIQUE (mbl_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS hbl_mbl_id_idx ON hbl (mbl_id);
CREATE INDEX IF NOT EXISTS hbl_container_id_idx ON hbl (container_id);
CREATE INDEX IF NOT EXISTS hbl_customer_id_idx ON hbl (customer_id);

-- ---- orders.hbl_id --------------------------------------------------------------
-- Parallel to `orders.case_id` (→ order_account.id) — orders created under the
-- new MBL/HBL flow attach here instead. An order should only ever use one of
-- the two columns in practice; the two flows are kept separate by the app.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hbl_id INTEGER REFERENCES hbl(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_hbl_id_idx ON orders (hbl_id);
