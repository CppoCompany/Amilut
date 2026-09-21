-- =============================================================================
-- 012_orders_case_id
-- Flips the case↔order relationship: previously `order_account.order_id`
-- was `NOT NULL UNIQUE REFERENCES orders(id)` (1 case ↔ 1 order). A shipping
-- case can now hold multiple orders, so the FK moves to the "many" side:
-- `orders.case_id` (nullable, not unique) → `order_account.id`. Each order
-- still belongs to at most one case at a time; a case can hold any number.
--
-- Run this file against the `Amilut` database.
--
-- Idempotent: `ADD/DROP COLUMN IF [NOT] EXISTS`, `DROP CONSTRAINT/INDEX IF
-- EXISTS`. The backfill only touches rows where `case_id IS NULL`, so
-- re-running never overwrites a later manual reassignment.
-- =============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS case_id INTEGER REFERENCES order_account(id) ON DELETE SET NULL;

-- Preserve every existing 1:1 case↔order pairing under the new column. Guarded
-- and dynamic because `order_account.order_id` is dropped further down in
-- this same file — a plain static UPDATE referencing it would fail to parse
-- on any re-run once the column is gone.
DO
$$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'order_account' AND column_name = 'order_id'
    ) THEN
        EXECUTE '
            UPDATE orders o SET case_id = oa.id
              FROM order_account oa
             WHERE oa.order_id = o.id AND o.case_id IS NULL';
    END IF;
END
$$;

-- Drop the old 1:1 constraint/index/column (names carry the `shipments_`
-- prefix from before the 006 table rename — Postgres never renames these).
ALTER TABLE order_account DROP CONSTRAINT IF EXISTS shipments_order_id_fkey;
ALTER TABLE order_account DROP CONSTRAINT IF EXISTS shipments_order_id_key;
DROP INDEX IF EXISTS shipments_order_id_idx;
ALTER TABLE order_account DROP COLUMN IF EXISTS order_id;

CREATE INDEX IF NOT EXISTS orders_case_id_idx ON orders (case_id);
