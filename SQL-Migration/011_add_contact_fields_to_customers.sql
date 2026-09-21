-- =============================================================================
-- 011_add_contact_fields_to_customers
-- Adds ח״פ (company registration number) and איש קשר (contact person: name +
-- phone) to `customers`, for the "לקוח חדש" popup on the order screen.
--
-- Run this file against the `Amilut` database.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS`.
-- =============================================================================

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS company_reg_number VARCHAR(20),
    ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
