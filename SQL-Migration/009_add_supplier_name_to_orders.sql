-- =============================================================================
-- 009_add_supplier_name_to_orders
-- Adds `supplier_name` ("שם ספק") to the `orders` table — part of
-- "פרטי לקוח ופתיחה" alongside the existing customer/handler fields.
--
-- Run this file against the `Amilut` database.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS`.
-- =============================================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(200);
