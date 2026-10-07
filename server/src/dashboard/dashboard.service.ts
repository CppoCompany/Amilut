import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MblShippingType, MblStatus } from '../mbl/mbl.enums';
import { OrderStatus } from '../orders/orders.enums';
import {
  DashboardCaseInReleaseRowDto,
  DashboardCaseRowDto,
  DashboardClassificationRowDto,
  DashboardImportProcessRowDto,
  DashboardOrderRowDto,
  DashboardResponseDto,
} from './dto/dashboard.dto';

/** Rows per card. */
export const DASHBOARD_ROW_LIMIT = 5;

/** `mbl.status` value that denotes "in customs release" ("בהתרה"). */
export const MBL_STATUS_IN_RELEASE = MblStatus.IN_RELEASE;

interface OrderRow {
  id: number;
  customer_name: string | null;
  handler_name: string | null;
  status: OrderStatus;
  created_at: Date | string;
}

/** Row shape shared by the three MBL-backed cards (see MBL_CASE_SELECT). */
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

interface ClassificationRow {
  file_id: number;
  mbl_id: number;
  line_index: number | string;
  item: string | null;
  description: string | null;
  classification_code: string | null;
  country_name: string | null;
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
         count(DISTINCT h.id) AS hbl_count,
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

/** "התיקים שלי" — MBL cases handled by the signed-in user (`mbl.handler_user_id`), newest first. */
export const MY_CASES_SQL = `${MBL_CASE_SELECT}
   WHERE m.handler_user_id = $1
   ${MBL_CASE_GROUP_BY}
   ORDER BY m.id DESC
   LIMIT $2`;

/** "תהליכי יבוא" — every MBL case (all handlers, all statuses), newest first. */
export const IMPORT_PROCESSES_SQL = `${MBL_CASE_SELECT}
   ${MBL_CASE_GROUP_BY}
   ORDER BY m.id DESC
   LIMIT $1`;

/**
 * "הסיווגים שלי" — one row per supplier-invoice line item that has a saved
 * classification (`data.lineItems[].classification`). Unscoped: no ownership
 * column exists on the file → case chain.
 */
export const MY_CLASSIFICATIONS_SQL = `
  SELECT f.id AS file_id,
         f.account_id AS mbl_id,
         li.idx - 1 AS line_index,
         li.item->>'item' AS item,
         li.item->>'description' AS description,
         li.item->'classification'->>'classificationCode' AS classification_code,
         co.name AS country_name,
         f.created_at
    FROM import_account_files f
   CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.data->'lineItems', '[]'::jsonb))
         WITH ORDINALITY AS li(item, idx)
    LEFT JOIN countries co
      ON co.id = NULLIF(li.item->'classification'->>'countryId', '')::int
   WHERE jsonb_typeof(li.item) = 'object'
     AND li.item ? 'classification'
     AND jsonb_typeof(li.item->'classification') = 'object'
   ORDER BY f.created_at DESC, f.id DESC, li.idx
   LIMIT $1`;

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
      myClassifications,
      myCases,
      importProcesses,
    ] = await Promise.all([
      this.findMyOrders(userId),
      this.findCasesInRelease(),
      this.findMyClassifications(),
      this.findMyCases(userId),
      this.findImportProcesses(),
    ]);
    return {
      myOrders,
      casesInRelease,
      myClassifications,
      myCases,
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

  /** "הסיווגים שלי": classified invoice lines, unscoped (no owner column). */
  async findMyClassifications(): Promise<DashboardClassificationRowDto[]> {
    const rows = await this.db.query<ClassificationRow>(
      MY_CLASSIFICATIONS_SQL,
      [DASHBOARD_ROW_LIMIT],
    );
    return rows.map((row) => ({
      fileId: row.file_id,
      mblId: row.mbl_id,
      lineIndex: Number(row.line_index),
      item: row.item ?? '',
      description: row.description ?? '',
      classificationCode: row.classification_code ?? '',
      countryName: row.country_name,
      createdAt: toIsoString(row.created_at),
    }));
  }

  /** "התיקים שלי": `mbl.handler_user_id = userId`. */
  async findMyCases(userId: number): Promise<DashboardCaseRowDto[]> {
    const rows = await this.db.query<MblCaseRow>(MY_CASES_SQL, [
      userId,
      DASHBOARD_ROW_LIMIT,
    ]);
    return rows.map((row) => ({
      id: row.id,
      mblNumber: row.mbl_number,
      shippingType: row.shipping_type,
      customerNames: row.customer_names ?? [],
      carrierName: row.carrier_name,
      status: row.status,
      createdAt: toIsoString(row.created_at),
    }));
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
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
