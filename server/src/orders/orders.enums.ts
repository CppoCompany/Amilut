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

/**
 * Incoterm chosen under the payment terms. In the UI the prepaid group offers
 * CFR/CAF/CPT/CIP and the collect group offers EXW/FCA/FOB/FAC/DAF/DES/DEQ/DDU/DDP
 * (see INCOTERMS_BY_PAYMENT_TERMS). Values match the `orders.incoterm` CHECK.
 */
export enum Incoterm {
  CFR = 'CFR',
  CAF = 'CAF',
  CPT = 'CPT',
  CIP = 'CIP',
  EXW = 'EXW',
  FCA = 'FCA',
  FOB = 'FOB',
  FAC = 'FAC',
  DAF = 'DAF',
  DES = 'DES',
  DEQ = 'DEQ',
  DDU = 'DDU',
  DDP = 'DDP',
}

/** Which incoterms are valid for each payment-terms choice (mirrors the order form). */
export const INCOTERMS_BY_PAYMENT_TERMS: Record<
  PaymentTerms,
  readonly Incoterm[]
> = {
  [PaymentTerms.PREPAID]: [
    Incoterm.CFR,
    Incoterm.CAF,
    Incoterm.CPT,
    Incoterm.CIP,
  ],
  [PaymentTerms.COLLECT]: [
    Incoterm.EXW,
    Incoterm.FCA,
    Incoterm.FOB,
    Incoterm.FAC,
    Incoterm.DAF,
    Incoterm.DES,
    Incoterm.DEQ,
    Incoterm.DDU,
    Incoterm.DDP,
  ],
};
