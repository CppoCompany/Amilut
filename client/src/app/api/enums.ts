/**
 * Thin, hand-written layer over the generated OpenAPI enums.
 *
 * The enums themselves come from `./generated/schema.ts` (regenerate with `npm run api:generate`
 * at the repo root). This file only re-exports them and adds Hebrew UI labels. The label maps are
 * typed as `Record<Enum, string>` so that adding a member on the server (and regenerating) fails
 * compilation here until a label is provided.
 */
import {
  Destination,
  Incoterm,
  OrderStatus,
  PaymentTerms,
  ShipmentDocumentType,
  ShipmentType,
} from './generated/schema';

export { Destination, Incoterm, OrderStatus, PaymentTerms, ShipmentDocumentType, ShipmentType };

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PREPARING]: 'בהכנה',
  [OrderStatus.READY_FOR_PICKUP]: 'מוכנה לאיסוף',
  [OrderStatus.PICKED_UP]: 'נאספה',
  [OrderStatus.WAITING_AT_PORT]: 'ממתינה בנמל',
  [OrderStatus.DEPARTED]: 'יצאה לדרך',
};

export const SHIPMENT_TYPE_LABELS: Record<ShipmentType, string> = {
  [ShipmentType.SEA]: 'ימי',
  [ShipmentType.AIR]: 'אווירי',
  [ShipmentType.LAND]: 'יבשתי',
};

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  [PaymentTerms.PREPAID]: 'Prepaid',
  [PaymentTerms.COLLECT]: 'Collect',
};

/** Incoterms are shown as their codes. */
export const INCOTERM_LABELS: Record<Incoterm, string> = {
  [Incoterm.CFR]: 'CFR',
  [Incoterm.CAF]: 'CAF',
  [Incoterm.CPT]: 'CPT',
  [Incoterm.CIP]: 'CIP',
  [Incoterm.EXW]: 'EXW',
  [Incoterm.FCA]: 'FCA',
  [Incoterm.FOB]: 'FOB',
  [Incoterm.FAC]: 'FAC',
  [Incoterm.DAF]: 'DAF',
  [Incoterm.DES]: 'DES',
  [Incoterm.DEQ]: 'DEQ',
  [Incoterm.DDU]: 'DDU',
  [Incoterm.DDP]: 'DDP',
};

/**
 * Incoterms offered under each payment-terms choice (mirrors the server's
 * INCOTERMS_BY_PAYMENT_TERMS; the server rejects a mismatch).
 */
export const INCOTERMS_BY_PAYMENT_TERMS: Record<PaymentTerms, readonly Incoterm[]> = {
  [PaymentTerms.PREPAID]: [Incoterm.CFR, Incoterm.CAF, Incoterm.CPT, Incoterm.CIP],
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

export const DESTINATION_LABELS: Record<Destination, string> = {
  [Destination.ASHDOD]: 'נמל אשדוד',
  [Destination.SOUTH_PORT]: 'נמל הדרום',
  [Destination.HAIFA]: 'נמל חיפה',
  [Destination.BEN_GURION]: 'נתב"ג',
};

export const SHIPMENT_DOCUMENT_TYPE_LABELS: Record<ShipmentDocumentType, string> = {
  [ShipmentDocumentType.ORIGINAL]: 'Original',
  [ShipmentDocumentType.SEA_WAYBILL]: 'Sea Waybill',
  [ShipmentDocumentType.TELEX_RELEASE]: 'Telex Release',
};

/** All members of each enum, in server declaration order — handy for rendering option lists. */
export const ORDER_STATUSES: readonly OrderStatus[] = Object.values(OrderStatus);
export const SHIPMENT_TYPES: readonly ShipmentType[] = Object.values(ShipmentType);
export const PAYMENT_TERMS: readonly PaymentTerms[] = Object.values(PaymentTerms);
export const DESTINATIONS: readonly Destination[] = Object.values(Destination);
export const INCOTERMS: readonly Incoterm[] = Object.values(Incoterm);
export const SHIPMENT_DOCUMENT_TYPES: readonly ShipmentDocumentType[] =
  Object.values(ShipmentDocumentType);
