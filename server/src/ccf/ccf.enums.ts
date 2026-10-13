/**
 * Lifecycle status of a Customs Clearance File (`customs_clearance_files.status`).
 * Values match the table's `status` CHECK constraint (migration 019).
 *
 * Hebrew UI labels:
 * - OPEN   → פתוח
 * - CLOSED → סגור
 */
export enum CcfStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}
