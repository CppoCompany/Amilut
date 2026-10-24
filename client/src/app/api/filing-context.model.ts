/**
 * Every uploaded paperwork file belongs to exactly one of an Order or a
 * Customs Clearance File (never both, never a shipping case — see migration
 * `021_import_account_files_order_or_ccf.sql`). This single type is used
 * everywhere a "which Order/CCF is this paperwork/classification screen
 * currently showing" value is passed: `NavigationService`'s hand-off
 * signals, `FilingContextService`, `FilingRecords`, `ImportFilesPanel`,
 * and the screens that feed them (Order, CCF, "ההזמנות שלי", "הסיווגים שלי").
 */
export type FilingContext = { kind: 'order'; id: number } | { kind: 'ccf'; id: number };
