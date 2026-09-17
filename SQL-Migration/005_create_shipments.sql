-- =============================================================================
-- 005_create_shipments
-- Creates the `shipments` table (workspace → "ניהול תיק" / file management
-- screen) inside the `Amilut` database.
--
-- One shipment row is a 1:1 customs-clearance extension of an order — it
-- holds the Bill of Lading / forwarder / shipper / consignee / cargo /
-- container detail for that order's file. `order_id` is UNIQUE so each order
-- has at most one shipment file; deleting the order deletes its file.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS / IF NOT EXISTS on the index.
-- =============================================================================

-- ---- shipments ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
    id                       SERIAL       PRIMARY KEY,
    order_id                 INTEGER      NOT NULL UNIQUE
        REFERENCES orders(id) ON DELETE CASCADE,

    -- זיהוי מסמך — Document Type & Number
    bill_of_lading_number    VARCHAR(50),
    document_type            VARCHAR(20)
        CHECK (document_type IN ('original', 'sea_waybill', 'telex_release')),
    bl_issue_date            DATE,

    -- מוביל — Forwarder
    forwarder_name           VARCHAR(200),
    voyage_flight_number     VARCHAR(50),
    vessel_name              VARCHAR(200),
    port_of_loading          VARCHAR(100),
    port_of_discharge        VARCHAR(100),
    manifest_number          VARCHAR(50),
    transaction_number       VARCHAR(50),

    -- שוגר — Shipper
    shipper_name             VARCHAR(200),
    shipper_address          VARCHAR(500),

    -- נמען — Consignee
    consignee_name           VARCHAR(200),
    consignee_address        VARCHAR(500),

    -- Notify Party
    notify_party             VARCHAR(200),

    -- מטען — Cargo
    cargo_description        VARCHAR(500),
    package_count            INTEGER,
    package_unit             VARCHAR(30),
    gross_weight_kg          NUMERIC(10, 2),
    net_weight_kg            NUMERIC(10, 2),
    volume_cbm               NUMERIC(10, 2),

    -- מכס — Tariff HS Code
    hs_code                  VARCHAR(20),

    -- תנאים — Terms (Incoterms / Freight Terms already live on the parent
    -- order — see orders.incoterm / orders.payment_terms — so only the
    -- shipment-specific dangerous-goods flag is stored here)
    dangerous_goods          BOOLEAN      NOT NULL DEFAULT false,
    dangerous_goods_imo_class VARCHAR(20),

    -- מסמכים — Documents (container)
    container_number         VARCHAR(20),
    container_type           VARCHAR(10),
    container_seal_number    VARCHAR(30),

    -- bookkeeping
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shipments_order_id_idx ON shipments (order_id);
