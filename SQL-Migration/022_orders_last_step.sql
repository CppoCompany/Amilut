-- =============================================================================
-- 022_orders_last_step
-- Adds `orders.last_step` — the furthest step of the tabbed order form
-- ("יצירת הזמנה") the user has reached. Every save writes it, so reopening a
-- partly-filled order resumes on that step.
--
-- Values must stay in sync with `OrderStep` in server/src/orders/orders.enums.ts:
--   customer → פרטי לקוח, shipment → פרטי משלוח,
--   schedule → לוחות זמנים והובלה, documents → מסמכים
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` (existing rows get 'customer'); the
-- CHECK constraint is only added when it is not there yet.
-- =============================================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS last_step VARCHAR(20) NOT NULL DEFAULT 'customer';

DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'orders_last_step_check'
           AND conrelid = 'orders'::regclass
    ) THEN
        ALTER TABLE orders
            ADD CONSTRAINT orders_last_step_check
            CHECK (last_step IN ('customer', 'shipment', 'schedule', 'documents'));
    END IF;
END
$$;
