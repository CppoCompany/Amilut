/**
 * Shipping type chosen in step 1 of "יצירת תיק שילוח" (the new MBL/HBL
 * workflow). Deliberately narrower than `orders`' `ShipmentType` (which also
 * has `LAND`) — only sea and air are valid entry points for this workflow,
 * matching the `mbl.shipping_type` CHECK constraint.
 *
 * Hebrew UI labels:
 * - SEA → ימי
 * - AIR → אווירי
 */
export enum MblShippingType {
  SEA = 'sea',
  AIR = 'air',
}

/**
 * Sea freight method chosen in step 2 — determines how many containers/HBLs
 * an MBL can have and whether its HBLs share one customer. Required when
 * `shippingType = 'sea'`, absent when `'air'` (matches the
 * `mbl_sea_method_matches_shipping_type` CHECK constraint).
 *
 * - FCL_FCL: one container, one customer, one HBL.
 * - FCL_LCL: one container, one customer, multiple HBLs.
 * - LCL_LCL: one (shared) container, multiple customers, one HBL per customer.
 * - GROUPAGE_FCL: multiple containers (see `mbl_container`), each with its
 *   own HBL(s) — see `hbl.container_id`.
 */
export enum SeaMethod {
  FCL_FCL = 'fcl_fcl',
  FCL_LCL = 'fcl_lcl',
  LCL_LCL = 'lcl_lcl',
  GROUPAGE_FCL = 'groupage_fcl',
}

/**
 * Lifecycle status of an MBL shipping case (`mbl.status`, migration 018).
 * Values match the `mbl_status_check` CHECK constraint.
 *
 * Hebrew UI labels:
 * - OPEN       → פתוח
 * - IN_RELEASE → בהתרה
 * - RELEASED   → שוחרר
 * - CLOSED     → סגור
 */
export enum MblStatus {
  OPEN = 'open',
  IN_RELEASE = 'in_release',
  RELEASED = 'released',
  CLOSED = 'closed',
}
