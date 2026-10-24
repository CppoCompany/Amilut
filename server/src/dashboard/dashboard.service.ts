import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CcfStatus } from '../ccf/ccf.enums';
import { ImportDocumentType } from '../import-files/import-files.enums';
import { MblShippingType, MblStatus } from '../mbl/mbl.enums';
import { OrderStatus } from '../orders/orders.enums';
import {
  DashboardCaseInReleaseRowDto,
  DashboardCcfRowDto,
  DashboardImportProcessRowDto,
  DashboardOrderRowDto,
  DashboardResponseDto,
} from './dto/dashboard.dto';

/** Rows per card. */
export const DASHBOARD_ROW_LIMIT = 5;

/** Rows in the classification screen's "pending" list (the server's usual page-size ceiling). */
export const PENDING_CLASSIFICATION_LIST_LIMIT = 200;

/** `mbl.status` value that denotes "in customs release" ("בהתרה"). */
export const MBL_STATUS_IN_RELEASE = MblStatus.IN_RELEASE;

interface OrderRow {
  id: number;
  customer_name: string | null;
  handler_name: string | null;
  status: OrderStatus;
  created_at: Date | string;
}

/** Row shape shared by the two MBL-backed cards (see MBL_CASE_SELECT). */
interface MblCaseRow {
  id: number;
  mbl_number: string | null;
  shipping_type: MblShippingType;
  carrier_name: string | null;
  status: MblStatus;
  hbl_count: string | number;
  customer_names: string[] | null;
  created_at: Date | string;
}

/** Row shape shared by the two CCF cards (see CCF_ROW_SELECT). */
interface CcfRow {
  id: number;
  file_number: string;
  shipment_file_id: number | null;
  shipment_file_mbl_number: string | null;
  customer_names: string[] | null;
  status: CcfStatus;
  line_count: string | number;
  classified_line_count: string | number;
  created_at: Date | string;
}

/** "ההזמנות שלי" — active orders handled by the signed-in user, newest first. */
export const MY_ORDERS_SQL = `
  SELECT o.id,
         c.name AS customer_name,
         u.name AS handler_name,
         o.status,
         o.created_at
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN users     u ON u.id = o.handler_user_id
   WHERE o."isActive"
     AND o.handler_user_id = $1
   ORDER BY o.id DESC
   LIMIT $2`;

/**
 * One MBL case per row with its customers aggregated across its HBLs, like
 * the "התיקים שלי" grid (MBL_SUMMARY_SELECT in mbl.service.ts). Each card
 * below adds its own WHERE and keeps its own GROUP BY/ORDER BY/LIMIT so the
 * definitions can diverge independently.
 */
const MBL_CASE_SELECT = `
  SELECT m.id,
         m.mbl_number,
         m.shipping_type,
         m.carrier_name,
         m.status,
         m.created_at,
         count(DISTINCT h.id) FILTER (WHERE NOT h.is_master_mirror) AS hbl_count,
         array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) AS customer_names
    FROM mbl m
    LEFT JOIN hbl       h ON h.mbl_id = m.id
    LEFT JOIN customers c ON c.id = h.customer_id`;

const MBL_CASE_GROUP_BY = `
   GROUP BY m.id, m.mbl_number, m.shipping_type, m.carrier_name, m.status, m.created_at`;

/** "תיקים בהתרה" — MBL cases whose `status` is `in_release`, newest first. */
export const CASES_IN_RELEASE_SQL = `${MBL_CASE_SELECT}
   WHERE m.status = $1
   ${MBL_CASE_GROUP_BY}
   ORDER BY m.id DESC
   LIMIT $2`;

/** "תהליכי יבוא" — every MBL case (all handlers, all statuses), newest first. */
export const IMPORT_PROCESSES_SQL = `${MBL_CASE_SELECT}
   ${MBL_CASE_GROUP_BY}
   ORDER BY m.id DESC
   LIMIT $1`;

/**
 * One Customs Clearance File per row, with its linked shipping case and the
 * classification progress of its supplier-invoice lines. Lines are counted
 * the way the classification screen lists them: only the newest upload per
 * file name counts (a re-upload supersedes the older file). A line counts as
 * classified once it has a non-blank customs code ("פרט מכס"). Each card
 * below adds its own WHERE/ORDER BY/LIMIT. `$1` is the supplier-invoice
 * document type.
 */
const CCF_ROW_SELECT = `
  SELECT c.id,
         c.file_number,
         c.shipment_file_id,
         m.mbl_number AS shipment_file_mbl_number,
         (SELECT array_agg(DISTINCT cu.name)
            FROM hbl h
            JOIN customers cu ON cu.id = h.customer_id
           WHERE (c.hbl_id IS NULL AND h.mbl_id = c.shipment_file_id)
              OR h.id = c.hbl_id) AS customer_names,
         c.status,
         inv_lines.line_count,
         inv_lines.classified_line_count,
         c.created_at
    FROM customs_clearance_files c
    LEFT JOIN mbl m ON m.id = COALESCE(c.shipment_file_id,
                                       (SELECT ch.mbl_id FROM hbl ch WHERE ch.id = c.hbl_id))
   CROSS JOIN LATERAL (
         SELECT count(*) AS line_count,
                count(*) FILTER (
                  WHERE btrim(COALESCE(li.item->'classification'->>'classificationCode', '')) <> ''
                ) AS classified_line_count
           FROM (SELECT DISTINCT ON (f.data->>'name') f.data
                   FROM import_account_files f
                  WHERE f.ccf_id = c.id
                    AND f.data->>'documentType' = $1
                  ORDER BY f.data->>'name', f.id DESC) inv
          CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(inv.data->'lineItems') = 'array'
                     THEN inv.data->'lineItems'
                     ELSE '[]'::jsonb
                END) AS li(item)
         ) inv_lines`;

/**
 * "תיקי עמילות שלא עברו סיווג" — CCFs that are not fully classified: no
 * supplier-invoice lines yet, or at least one line without a customs code.
 * Unscoped (all users), newest first.
 */
export const CCFS_PENDING_CLASSIFICATION_SQL = `${CCF_ROW_SELECT}
   WHERE inv_lines.line_count = 0
      OR inv_lines.classified_line_count < inv_lines.line_count
   ORDER BY c.id DESC
   LIMIT $2`;

/** "תיקי עמילות" — every CCF, whatever its classification state, newest first. */
export const CCFS_SQL = `${CCF_ROW_SELECT}
   ORDER BY c.id DESC
   LIMIT $2`;

/**
 * Read-only aggregator behind `GET /api/dashboard`. Each card has its own
 * method and SQL constant so a definition can be adjusted in isolation.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}

  /** All five cards for the signed-in user, fetched concurrently. */
  async getDashboard(userId: number): Promise<DashboardResponseDto> {
    const [
      myOrders,
      casesInRelease,
      ccfsPendingClassification,
      ccfs,
      importProcesses,
    ] = await Promise.all([
      this.findMyOrders(userId),
      this.findCasesInRelease(),
      this.findCcfsPendingClassification(),
      this.findCcfs(),
      this.findImportProcesses(),
    ]);
    return {
      myOrders,
      casesInRelease,
      ccfsPendingClassification,
      ccfs,
      importProcesses,
    };
  }

  /** "ההזמנות שלי": `orders.handler_user_id = userId`. */
  async findMyOrders(userId: number): Promise<DashboardOrderRowDto[]> {
    const rows = await this.db.query<OrderRow>(MY_ORDERS_SQL, [
      userId,
      DASHBOARD_ROW_LIMIT,
    ]);
    return rows.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      handlerName: row.handler_name,
      status: row.status,
      createdAt: toIsoString(row.created_at),
    }));
  }

  /** "תיקים בהתרה": `mbl.status = 'in_release'`. */
  async findCasesInRelease(): Promise<DashboardCaseInReleaseRowDto[]> {
    const rows = await this.db.query<MblCaseRow>(CASES_IN_RELEASE_SQL, [
      MBL_STATUS_IN_RELEASE,
      DASHBOARD_ROW_LIMIT,
    ]);
    return rows.map((row) => ({
      id: row.id,
      mblNumber: row.mbl_number,
      customerNames: row.customer_names ?? [],
      carrierName: row.carrier_name,
      status: row.status,
      createdAt: toIsoString(row.created_at),
    }));
  }

  /**
   * "תיקי עמילות שלא עברו סיווג": CCFs with an unclassified (or no) invoice
   * line. The card shows the newest {@link DASHBOARD_ROW_LIMIT}; the
   * classification screen's list passes a larger `limit`.
   */
  async findCcfsPendingClassification(
    limit = DASHBOARD_ROW_LIMIT,
  ): Promise<DashboardCcfRowDto[]> {
    return this.findCcfRows(CCFS_PENDING_CLASSIFICATION_SQL, limit);
  }

  /** "תיקי עמילות": every CCF, unscoped. */
  async findCcfs(): Promise<DashboardCcfRowDto[]> {
    return this.findCcfRows(CCFS_SQL);
  }

  /** "תהליכי יבוא": every MBL case, unscoped. */
  async findImportProcesses(): Promise<DashboardImportProcessRowDto[]> {
    const rows = await this.db.query<MblCaseRow>(IMPORT_PROCESSES_SQL, [
      DASHBOARD_ROW_LIMIT,
    ]);
    return rows.map((row) => ({
      id: row.id,
      mblNumber: row.mbl_number,
      shippingType: row.shipping_type,
      customerNames: row.customer_names ?? [],
      carrierName: row.carrier_name,
      hblCount: Number(row.hbl_count),
      status: row.status,
      createdAt: toIsoString(row.created_at),
    }));
  }

  private async findCcfRows(
    sql: string,
    limit = DASHBOARD_ROW_LIMIT,
  ): Promise<DashboardCcfRowDto[]> {
    const rows = await this.db.query<CcfRow>(sql, [
      ImportDocumentType.SUPPLIER_INVOICE,
      limit,
    ]);
    return rows.map((row) => ({
      id: row.id,
      fileNumber: row.file_number,
      shipmentFileId: row.shipment_file_id,
      shipmentFileMblNumber: row.shipment_file_mbl_number,
      customerNames: row.customer_names ?? [],
      status: row.status,
      lineCount: Number(row.line_count),
      classifiedLineCount: Number(row.classified_line_count),
      createdAt: toIsoString(row.created_at),
    }));
  }
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
