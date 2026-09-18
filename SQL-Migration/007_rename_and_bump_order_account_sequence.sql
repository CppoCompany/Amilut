-- =============================================================================
-- 007_rename_and_bump_order_account_sequence
-- Two cleanups for `order_account.id` (the shipment/file number):
--
--   1. `ALTER TABLE shipments RENAME TO order_account` (006) does NOT rename
--      the underlying SERIAL sequence, which is still literally named
--      `shipments_id_seq`. Rename it to `order_account_id_seq` to match.
--
--   2. Bump it so file numbers start at 1000 (matching `orders.id`, see
--      003_create_orders.sql). Unlike 003's sequence, this one has already
--      issued values from earlier testing, so the `NOT is_called` guard used
--      there won't fire — this bumps unconditionally whenever the sequence
--      is still below 1000.
--
-- Run this file against the `Amilut` database.
--
-- Idempotent: the rename is a no-op once `shipments_id_seq` no longer exists;
-- the bump is a no-op once the sequence is already at or above 1000.
-- =============================================================================

ALTER SEQUENCE IF EXISTS shipments_id_seq RENAME TO order_account_id_seq;

DO
$$
BEGIN
    IF (SELECT last_value FROM order_account_id_seq) < 1000 THEN
        PERFORM setval('order_account_id_seq', 1000, false);
    END IF;
END
$$;
