/**
 * Independent workflow status tracks (migrations 027/028). Shared design for
 * sea and air; implemented for air first — sea rows keep these NULL and keep
 * using `mbl.status` / `customs_clearance_files.status` as before.
 * Values match the CHECK constraints by hand.
 */

/** Which entity a history row describes (`status_history.entity_type`). */
export enum StatusEntityType {
  MBL = 'mbl',
  HBL = 'hbl',
  CCF = 'ccf',
}

/** `status_history.track`. */
export enum StatusTrack {
  SHIPMENT = 'shipment',
  DOCUMENT = 'document',
  CLEARANCE = 'clearance',
}

/**
 * `status_history.source`:
 * - MANUAL     — set by a user, moving forward (or sideways).
 * - AUTO       — set by the server from a reliable event (flight-leg ATD/ATA).
 * - CORRECTION — a user moved it backwards / cleared it; reason required.
 */
export enum StatusChangeSource {
  MANUAL = 'manual',
  AUTO = 'auto',
  CORRECTION = 'correction',
}

/**
 * MAWB shipment status (`mbl.shipment_status`). DEPARTED and ARRIVED are set
 * automatically from the first leg's ATD / last leg's ATA; the rest is manual.
 *
 * Hebrew UI labels:
 * - BOOKING_CONFIRMED → הזמנת מקום אושרה
 * - DEPARTED          → המריא
 * - IN_TRANSIT        → בדרך (נחיתת ביניים)
 * - ARRIVED           → נחת
 */
export enum ShipmentStatus {
  BOOKING_CONFIRMED = 'booking_confirmed',
  DEPARTED = 'departed',
  IN_TRANSIT = 'in_transit',
  ARRIVED = 'arrived',
}

/** Whether `mbl.shipment_status` was last set by a user or by the server. */
export enum ShipmentStatusSource {
  MANUAL = 'manual',
  AUTO = 'auto',
}

/**
 * HAWB document status (`hbl.document_status`). Air houses start at PENDING.
 *
 * Hebrew UI labels:
 * - PENDING             → ממתין למסמכים
 * - UNDER_REVIEW        → בבדיקה
 * - MISSING_INFORMATION → חסר מידע
 * - APPROVED            → מסמכים אושרו
 */
export enum DocumentStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  MISSING_INFORMATION = 'missing_information',
  APPROVED = 'approved',
}

/**
 * Customs clearance status of a per-house (air) CCF
 * (`customs_clearance_files.clearance_status`). Starts at NOT_STARTED.
 *
 * Hebrew UI labels:
 * - NOT_STARTED           → טרם התחיל
 * - CLASSIFICATION        → סיווג טובין
 * - COMPLIANCE_CHECK      → בדיקת חוקיות יבוא
 * - READY_FOR_DECLARATION → מוכן להצהרה
 */
export enum ClearanceStatus {
  NOT_STARTED = 'not_started',
  CLASSIFICATION = 'classification',
  COMPLIANCE_CHECK = 'compliance_check',
  READY_FOR_DECLARATION = 'ready_for_declaration',
}

/** Progress rank per value — moving to a lower rank (or clearing) is a correction. */
export const STATUS_RANK: Record<string, number> = {
  [ShipmentStatus.BOOKING_CONFIRMED]: 1,
  [ShipmentStatus.DEPARTED]: 2,
  [ShipmentStatus.IN_TRANSIT]: 3,
  [ShipmentStatus.ARRIVED]: 4,
  [DocumentStatus.PENDING]: 1,
  [DocumentStatus.UNDER_REVIEW]: 2,
  [DocumentStatus.MISSING_INFORMATION]: 2,
  [DocumentStatus.APPROVED]: 3,
  [ClearanceStatus.NOT_STARTED]: 1,
  [ClearanceStatus.CLASSIFICATION]: 2,
  [ClearanceStatus.COMPLIANCE_CHECK]: 3,
  [ClearanceStatus.READY_FOR_DECLARATION]: 4,
};

export function statusRank(value: string | null): number {
  return value === null ? 0 : (STATUS_RANK[value] ?? 0);
}
