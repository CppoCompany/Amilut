-- =============================================================================
-- 006_rename_shipments_to_order_account
-- Renames the `shipments` table (created by 005_create_shipments.sql) to
-- `order_account` inside the `Amilut` database. Columns, indexes, the FK to
-- `orders`, and the CHECK constraint are unchanged — only the table name.
--
-- Run this file against the `Amilut` database.
--
-- Idempotent: 005's own guard (`CREATE TABLE IF NOT EXISTS shipments`) has no
-- way to know the table was renamed here, so once `order_account` exists, a
-- later re-run of 005 recreates an empty `shipments` table alongside it. This
-- file both performs the rename on first run and cleans up that stray empty
-- table on every later run, so re-running the full migration set stays safe.
-- =============================================================================

DO
$$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_account')
    THEN
        -- Already renamed in a previous run; drop the empty stray 005 just recreated.
        DROP TABLE IF EXISTS shipments;
    ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shipments')
    THEN
        ALTER TABLE shipments RENAME TO order_account;
    END IF;
END
$$;
