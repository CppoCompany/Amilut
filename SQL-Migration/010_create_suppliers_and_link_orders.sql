-- =============================================================================
-- 010_create_suppliers_and_link_orders
-- Creates `suppliers` (exact mirror of `customers`) and links `orders` to it
-- via `supplier_id`, replacing the free-text `supplier_name` column added in
-- 009 (no real data depends on it yet).
--
-- Run this file against the `Amilut` database.
--
-- Idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD/DROP COLUMN IF [NOT] EXISTS`.
-- =============================================================================

-- ---- suppliers ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
    id         SERIAL       PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    address    VARCHAR(500),
    phone      VARCHAR(50),
    email      VARCHAR(255),
    "isActive" BOOLEAN      NOT NULL DEFAULT true
);

-- ---- orders.supplier_id ---------------------------------------------------------
ALTER TABLE orders DROP COLUMN IF EXISTS supplier_name;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id);
