-- =============================================================================
-- 029_fix_air_test_orders_destination
-- Two development test orders were saved as air shipments with a sea-port
-- destination (`ashdod`). Air shipments now arrive at an airport flagged
-- `is_import_destination` (025), so these two are moved to Ben Gurion — the
-- `orders.destination` code mapped to TLV in `airport.order_destination`.
--
-- Identified as test data before writing this migration (2026-10-23): orders
-- 1001 and 1003, both with flight number '57755555', no uploaded documents,
-- no HBL, the order form left on its first step. The UPDATE matches on all of
-- those fingerprints (not on id alone), so on any other database it touches
-- nothing unless the very same test rows exist there.
--
-- Any OTHER air order whose destination is not an airport destination is left
-- untouched and only reported (RAISE NOTICE) — it may be real business data
-- and needs a human decision.
--
-- Run this file against the `Amilut` database. The runner issues
-- `SET ROLE "Admin"` first.
--
-- Idempotent: after the first run the WHERE clause no longer matches.
-- =============================================================================

DO
$$
DECLARE
    tlv_destination TEXT;
    fixed           INTEGER;
    other_ids       TEXT;
BEGIN
    SELECT order_destination INTO tlv_destination FROM airport WHERE code = 'TLV';
    IF tlv_destination IS NULL THEN
        RAISE EXCEPTION '029: airport TLV has no order_destination mapping (025 not applied?)';
    END IF;

    UPDATE orders o
       SET destination = tlv_destination,
           updated_at  = now()
     WHERE o.id IN (1001, 1003)
       AND o.shipment_type = 'air'
       AND o.destination = 'ashdod'
       AND o.flight_number = '57755555'
       AND o.hbl_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM import_account_files f WHERE f.order_id = o.id);
    GET DIAGNOSTICS fixed = ROW_COUNT;
    IF fixed > 0 THEN
        RAISE NOTICE '029: moved % air test order(s) to destination %', fixed, tlv_destination;
    END IF;

    SELECT string_agg(o.id::text, ', ' ORDER BY o.id) INTO other_ids
      FROM orders o
     WHERE o.shipment_type = 'air'
       AND NOT EXISTS (SELECT 1 FROM airport a
                        WHERE a.order_destination = o.destination AND a.is_import_destination);
    IF other_ids IS NOT NULL THEN
        RAISE NOTICE '029: air orders with a non-airport destination left unchanged for review: %', other_ids;
    END IF;
END
$$;
