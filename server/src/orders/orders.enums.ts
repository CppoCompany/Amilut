/**
 * Shipment mode of an order.
 *
 * Hebrew UI labels:
 * - SEA  → ימי
 * - AIR  → אווירי
 * - LAND → יבשתי
 */
export enum ShipmentType {
  SEA = 'sea',
  AIR = 'air',
  LAND = 'land',
}

/**
 * Lifecycle status of an order.
 *
 * Hebrew UI labels:
 * - PREPARING        → בהכנה
 * - READY_FOR_PICKUP → מוכנה לאיסוף
 * - PICKED_UP        → נאספה
 * - WAITING_AT_PORT  → ממתינה בנמל
 * - DEPARTED         → יצאה לדרך
 */
export enum OrderStatus {
  PREPARING = 'preparing',
  READY_FOR_PICKUP = 'ready_for_pickup',
  PICKED_UP = 'picked_up',
  WAITING_AT_PORT = 'waiting_at_port',
  DEPARTED = 'departed',
}

/**
 * Who pays the freight.
 *
 * UI labels:
 * - PREPAID → Prepaid
 * - COLLECT → Collect
 */
export enum PaymentTerms {
  PREPAID = 'prepaid',
  COLLECT = 'collect',
}

/**
 * Israeli port / airport of arrival.
 *
 * Hebrew UI labels:
 * - ASHDOD     → נמל אשדוד
 * - SOUTH_PORT → נמל הדרום
 * - HAIFA      → נמל חיפה
 * - BEN_GURION → נתב"ג
 */
export enum Destination {
  ASHDOD = 'ashdod',
  SOUTH_PORT = 'south_port',
  HAIFA = 'haifa',
  BEN_GURION = 'ben_gurion',
}
