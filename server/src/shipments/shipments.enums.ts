/**
 * Bill of Lading type on a shipment file.
 *
 * UI labels:
 * - ORIGINAL      → Original
 * - SEA_WAYBILL   → Sea Waybill
 * - TELEX_RELEASE → Telex Release
 *
 * Values match the `shipments.document_type` CHECK constraint.
 */
export enum ShipmentDocumentType {
  ORIGINAL = 'original',
  SEA_WAYBILL = 'sea_waybill',
  TELEX_RELEASE = 'telex_release',
}
