/**
 * Kind of paperwork a file uploaded to an import case (`order_account`)
 * represents. Stored inside `import_account_files.data.documentType`.
 *
 * Hebrew UI labels (owned by the client):
 * - SUPPLIER_INVOICE       → חשבון ספק
 * - BILL_OF_LADING         → שטר מטען
 * - MASTER_BILL_OF_LADING  → שטר מטען-מסטר
 * - PACKING_LIST           → מפרט אריזות
 * - CERTIFICATE_OF_ORIGIN  → תעודת שוק/מקור
 *
 * Not to be confused with `ShipmentDocumentType` (the Bill of Lading *form*:
 * original / sea waybill / telex release).
 */
export enum ImportDocumentType {
  SUPPLIER_INVOICE = 'SUPPLIER_INVOICE',
  BILL_OF_LADING = 'BILL_OF_LADING',
  MASTER_BILL_OF_LADING = 'MASTER_BILL_OF_LADING',
  PACKING_LIST = 'PACKING_LIST',
  CERTIFICATE_OF_ORIGIN = 'CERTIFICATE_OF_ORIGIN',
}
