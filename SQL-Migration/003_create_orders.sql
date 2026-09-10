-- =============================================================================
-- 003_create_orders
-- Creates the `orders` table (workspace → "פתיחת הזמנה" screen) inside the
-- `Amilut` database.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first, so every object created here is owned by `Admin`.
--
-- Enum-like columns store English codes. They must stay in sync with the
-- TypeScript enums in server/src/orders/orders.enums.ts (the client enums are
-- generated from the server's OpenAPI spec):
--   status         → OrderStatus
--   shipment_type  → ShipmentType
--   payment_terms  → PaymentTerms
--   destination    → Destination
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS / IF NOT EXISTS on the index.
-- =============================================================================

-- ---- orders -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    -- מספר הזמנה פנימי — sequence starts at 1000 (see ALTER SEQUENCE below)
    id                  SERIAL       PRIMARY KEY,

    -- פרטי לקוח ופתיחה
    customer_id         INTEGER      NOT NULL REFERENCES customers(id),
    handler_user_id     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- פרטי משלוח
    status              VARCHAR(30)  NOT NULL DEFAULT 'preparing'
        CHECK (status IN ('preparing', 'ready_for_pickup', 'picked_up',
                          'waiting_at_port', 'departed')),
    shipment_type       VARCHAR(10)  NOT NULL
        CHECK (shipment_type IN ('sea', 'air', 'land')),
    payment_terms       VARCHAR(10)  NOT NULL
        CHECK (payment_terms IN ('prepaid', 'collect')),
    incoterm            VARCHAR(5)   NOT NULL
        CHECK (incoterm IN ('CFR', 'CAF', 'CPT', 'CIP',
                            'EXW', 'FCA', 'FOB', 'FAC',
                            'DAF', 'DES', 'DEQ', 'DDU', 'DDP')),
    destination         VARCHAR(30)  NOT NULL
        CHECK (destination IN ('ashdod', 'south_port', 'haifa', 'ben_gurion')),

    -- לוחות זמנים
    factory_ready_date  DATE,
    factory_pickup_date DATE,
    departure_date      DATE,
    eta_date            DATE,

    -- פרטי הובלה (sea fields for shipment_type = 'sea', air fields for 'air')
    shipping_line       VARCHAR(100),
    voyage_number       VARCHAR(50),
    airline             VARCHAR(100),
    flight_number       VARCHAR(50),

    -- bookkeeping
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "isActive"          BOOLEAN      NOT NULL DEFAULT true
);

-- Internal order numbers start at 1000. Only bumps the sequence if it is still
-- at its initial value, so re-running never rewinds it.
DO
$$
BEGIN
    IF (SELECT last_value FROM orders_id_seq) < 1000
       AND NOT (SELECT is_called FROM orders_id_seq) THEN
        PERFORM setval('orders_id_seq', 1000, false);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders (customer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx      ON orders (status);
