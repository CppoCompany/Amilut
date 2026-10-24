/**
 * Air shipment structure chosen in step 2 of "יצירת תיק שילוח" when the
 * shipping type is air (`mbl.air_method`, migration 026). Required when
 * `shippingType = 'air'`, absent for sea.
 *
 * - DIRECT:        MAWB only — the airline document names the importer. The
 *                  server keeps a hidden "mirror" house (`hbl.is_master_mirror`)
 *                  so orders / CCF / arrivals still attach to a house.
 * - CONSOLIDATION: one MAWB, many HAWBs (one per importer).
 * - BACK_TO_BACK:  one MAWB, exactly one HAWB.
 *
 * Hebrew UI labels:
 * - DIRECT        → ישיר
 * - CONSOLIDATION → קונסולידציה
 * - BACK_TO_BACK  → Back-to-back
 */
export enum AirMethod {
  DIRECT = 'direct',
  CONSOLIDATION = 'consolidation',
  BACK_TO_BACK = 'back_to_back',
}

/** How chargeable weight is rounded to the rule's step (`air_weight_rule.rounding_mode`). */
export enum WeightRoundingMode {
  UP = 'up',
  NEAREST = 'nearest',
}

/**
 * HAWB arrival state, derived from expected (`hbl.pieces`) vs received
 * (sum of non-voided `hbl_arrival.pieces_received`) — never stored.
 *
 * Hebrew UI labels:
 * - NOT_ARRIVED   → טרם הגיע
 * - PARTIAL       → הגעה חלקית
 * - COMPLETE      → הגיע במלואו
 * - OVER_RECEIVED → התקבל עודף (override)
 */
export enum ArrivalState {
  NOT_ARRIVED = 'not_arrived',
  PARTIAL = 'partial',
  COMPLETE = 'complete',
  OVER_RECEIVED = 'over_received',
}
