-- =============================================================================
-- 016_remove_legacy_shipment_cases
-- The pre-MBL/HBL "shipping case" workflow (`order_account`, fronted by the
-- now-removed `ShipmentsModule`/`ShipmentScreen`) has been fully replaced by
-- the MBL/HBL workflow (`mbl`/`mbl_container`/`hbl`, see 015). This clears out
-- every case created under the old workflow, per that migration decision.
--
-- `order_account` and `orders.case_id` are intentionally left in place (not
-- dropped) even though nothing in the app reads them anymore — removing the
-- data is enough to satisfy "no old cases left over"; dropping the table/
-- column is a separate, more irreversible step nobody asked for yet.
--
-- Run this file against the `Amilut` database.
--
-- Idempotent: deleting an already-empty table is a no-op. `orders.case_id`
-- (ON DELETE SET NULL) is cleared automatically by this delete, freeing those
-- orders back to unassigned.
-- =============================================================================

DELETE FROM order_account;
