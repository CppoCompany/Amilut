import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { ListShipmentsQuery } from './dto/list-shipments.query';
import { ShipmentDto } from './dto/shipment.dto';
import { ShipmentOrderSummaryDto } from './dto/shipment-order-summary.dto';
import { ShipmentSummaryDto } from './dto/shipment-summary.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { ShipmentDocumentType } from './shipments.enums';

type WritableShipmentField = Exclude<keyof CreateShipmentDto, 'orderIds'>;

/** Row shape produced by SHIPMENT_SELECT (DATE columns are pre-formatted in SQL). */
interface ShipmentRow {
  id: number;
  created_at: Date | string;
  updated_at: Date | string;
  bill_of_lading_number: string | null;
  document_type: ShipmentDocumentType | null;
  bl_issue_date: string | null;
  forwarder_name: string | null;
  voyage_flight_number: string | null;
  vessel_name: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  manifest_number: string | null;
  transaction_number: string | null;
  shipper_name: string | null;
  shipper_address: string | null;
  consignee_name: string | null;
  consignee_address: string | null;
  notify_party: string | null;
  cargo_description: string | null;
  package_count: number | null;
  package_unit: string | null;
  gross_weight_kg: string | null;
  net_weight_kg: string | null;
  volume_cbm: string | null;
  hs_code: string | null;
  dangerous_goods: boolean;
  dangerous_goods_imo_class: string | null;
  container_number: string | null;
  container_type: string | null;
  container_seal_number: string | null;
}

interface CaseOrderRow {
  id: number;
  customer_name: string | null;
}

interface ShipmentSummaryRow {
  id: number;
  order_ids: number[] | null;
  customer_names: string[] | null;
  bill_of_lading_number: string | null;
  document_type: ShipmentDocumentType | null;
  forwarder_name: string | null;
  created_at: Date | string;
}

/** DTO property → order_account column, for every client-writable field. */
const WRITABLE_COLUMNS: Record<WritableShipmentField, string> = {
  billOfLadingNumber: 'bill_of_lading_number',
  documentType: 'document_type',
  blIssueDate: 'bl_issue_date',
  forwarderName: 'forwarder_name',
  voyageFlightNumber: 'voyage_flight_number',
  vesselName: 'vessel_name',
  portOfLoading: 'port_of_loading',
  portOfDischarge: 'port_of_discharge',
  manifestNumber: 'manifest_number',
  transactionNumber: 'transaction_number',
  shipperName: 'shipper_name',
  shipperAddress: 'shipper_address',
  consigneeName: 'consignee_name',
  consigneeAddress: 'consignee_address',
  notifyParty: 'notify_party',
  cargoDescription: 'cargo_description',
  packageCount: 'package_count',
  packageUnit: 'package_unit',
  grossWeightKg: 'gross_weight_kg',
  netWeightKg: 'net_weight_kg',
  volumeCbm: 'volume_cbm',
  hsCode: 'hs_code',
  dangerousGoods: 'dangerous_goods',
  dangerousGoodsImoClass: 'dangerous_goods_imo_class',
  containerNumber: 'container_number',
  containerType: 'container_type',
  containerSealNumber: 'container_seal_number',
};

const WRITABLE_KEYS = Object.keys(WRITABLE_COLUMNS) as WritableShipmentField[];

const SHIPMENT_SELECT = `
  SELECT id,
         created_at,
         updated_at,
         bill_of_lading_number,
         document_type,
         to_char(bl_issue_date, 'YYYY-MM-DD') AS bl_issue_date,
         forwarder_name,
         voyage_flight_number,
         vessel_name,
         port_of_loading,
         port_of_discharge,
         manifest_number,
         transaction_number,
         shipper_name,
         shipper_address,
         consignee_name,
         consignee_address,
         notify_party,
         cargo_description,
         package_count,
         package_unit,
         gross_weight_kg,
         net_weight_kg,
         volume_cbm,
         hs_code,
         dangerous_goods,
         dangerous_goods_imo_class,
         container_number,
         container_type,
         container_seal_number
    FROM order_account`;

const CASE_ORDERS_SELECT = `
  SELECT o.id, c.name AS customer_name
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
   WHERE o.case_id = $1
   ORDER BY o.id`;

const SHIPMENT_SUMMARY_SELECT = `
  SELECT s.id,
         array_agg(DISTINCT o.id) FILTER (WHERE o.id IS NOT NULL) AS order_ids,
         array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) AS customer_names,
         s.bill_of_lading_number,
         s.document_type,
         s.forwarder_name,
         s.created_at
    FROM order_account s
    LEFT JOIN orders    o ON o.case_id = s.id
    LEFT JOIN customers c ON c.id = o.customer_id`;

const PG_FOREIGN_KEY_VIOLATION = '23503';

@Injectable()
export class ShipmentsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(query: ListShipmentsQuery): Promise<ShipmentSummaryDto[]> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (query.customerId !== undefined) {
      params.push(query.customerId);
      where.push(
        `EXISTS (SELECT 1 FROM orders o2 WHERE o2.case_id = s.id AND o2.customer_id = $${params.length})`,
      );
    }
    if (query.forwarderName !== undefined) {
      params.push(`%${query.forwarderName}%`);
      where.push(`s.forwarder_name ILIKE $${params.length}`);
    }
    if (query.caseNumber !== undefined) {
      params.push(query.caseNumber);
      where.push(`s.id = $${params.length}`);
    }

    params.push(query.limit ?? 50);
    const limitIdx = params.length;
    params.push(query.offset ?? 0);
    const offsetIdx = params.length;

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await this.db.query<ShipmentSummaryRow>(
      `${SHIPMENT_SUMMARY_SELECT}
       ${whereClause}
       GROUP BY s.id, s.bill_of_lading_number, s.document_type, s.forwarder_name, s.created_at
       ORDER BY s.id DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );
    return rows.map(toShipmentSummaryDto);
  }

  /** Opens a shipment case grouping the given orders. Reassigns any of them away from a prior case. */
  async create(dto: CreateShipmentDto): Promise<ShipmentDto> {
    const caseId = await this.db.transaction(async (client) => {
      await assertOrdersExist(
        (sql, params) => client.query(sql, params).then((r) => r.rows),
        dto.orderIds,
      );

      const keys = WRITABLE_KEYS.filter((key) => dto[key] !== undefined);
      const columns = keys.map((key) => WRITABLE_COLUMNS[key]);
      const values: unknown[] = keys.map((key) => dto[key]);
      const placeholders = values.map((_, i) => `$${i + 1}`);

      const insertSql = columns.length
        ? `INSERT INTO order_account (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`
        : `INSERT INTO order_account DEFAULT VALUES RETURNING id`;

      let inserted;
      try {
        inserted = await client.query<{ id: number }>(insertSql, values);
      } catch (err) {
        throw translateWriteError(err);
      }
      const newCaseId = inserted.rows[0]?.id;
      if (newCaseId === undefined) {
        throw new BadRequestException('Shipment was not created');
      }

      await client.query('UPDATE orders SET case_id = $1 WHERE id = ANY($2)', [
        newCaseId,
        dto.orderIds,
      ]);
      return newCaseId;
    });

    return this.findById(caseId);
  }

  async findById(id: number): Promise<ShipmentDto> {
    const row = await this.db.queryOne<ShipmentRow>(`${SHIPMENT_SELECT} WHERE id = $1`, [id]);
    if (!row) {
      throw new NotFoundException(`Shipment ${id} not found`);
    }
    const orders = await this.db.query<CaseOrderRow>(CASE_ORDERS_SELECT, [id]);
    return toShipmentDto(row, orders);
  }

  /** Looks up the case a given order currently belongs to, if any. */
  async findByOrderId(orderId: number): Promise<ShipmentDto> {
    const order = await this.db.queryOne<{ case_id: number | null }>(
      'SELECT case_id FROM orders WHERE id = $1',
      [orderId],
    );
    if (!order || order.case_id === null) {
      throw new NotFoundException(`Order ${orderId} has no shipment file yet`);
    }
    return this.findById(order.case_id);
  }

  /** Patches only the provided document fields; the order association is unaffected. */
  async update(id: number, dto: UpdateShipmentDto): Promise<ShipmentDto> {
    const keys = WRITABLE_KEYS.filter((key) => dto[key] !== undefined);
    if (keys.length === 0) {
      return this.findById(id);
    }

    const params: unknown[] = [];
    const sets = keys.map((key) => {
      params.push(dto[key]);
      return `${WRITABLE_COLUMNS[key]} = $${params.length}`;
    });
    sets.push('updated_at = now()');
    params.push(id);

    let updated: { id: number } | null;
    try {
      updated = await this.db.queryOne<{ id: number }>(
        `UPDATE order_account SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
        params,
      );
    } catch (err) {
      throw translateWriteError(err);
    }
    if (!updated) {
      throw new NotFoundException(`Shipment ${id} not found`);
    }
    return this.findById(id);
  }

  /** Replaces the full set of orders associated with a case. */
  async updateOrders(id: number, orderIds: number[]): Promise<ShipmentDto> {
    await this.db.transaction(async (client) => {
      const existing = await client.query<{ id: number }>(
        'SELECT id FROM order_account WHERE id = $1',
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Shipment ${id} not found`);
      }

      await assertOrdersExist(
        (sql, params) => client.query(sql, params).then((r) => r.rows),
        orderIds,
      );

      await client.query(
        'UPDATE orders SET case_id = NULL WHERE case_id = $1 AND NOT (id = ANY($2))',
        [id, orderIds],
      );
      await client.query('UPDATE orders SET case_id = $1 WHERE id = ANY($2)', [id, orderIds]);
    });

    return this.findById(id);
  }
}

/** Throws NotFoundException listing any id in `orderIds` that doesn't exist. */
async function assertOrdersExist(
  query: (sql: string, params: unknown[]) => Promise<{ id: number }[]>,
  orderIds: number[],
): Promise<void> {
  const found = await query('SELECT id FROM orders WHERE id = ANY($1)', [orderIds]);
  const foundIds = new Set(found.map((row) => row.id));
  const missing = orderIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new NotFoundException(`Order(s) not found: ${missing.join(', ')}`);
  }
}

function translateWriteError(err: unknown): unknown {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === PG_FOREIGN_KEY_VIOLATION) {
    return new BadRequestException('Referenced order does not exist');
  }
  return err;
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toNumberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function toShipmentDto(row: ShipmentRow, orders: CaseOrderRow[]): ShipmentDto {
  return {
    id: row.id,
    orders: orders.map(
      (order): ShipmentOrderSummaryDto => ({
        id: order.id,
        customerName: order.customer_name,
      }),
    ),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    billOfLadingNumber: row.bill_of_lading_number,
    documentType: row.document_type,
    blIssueDate: row.bl_issue_date,
    forwarderName: row.forwarder_name,
    voyageFlightNumber: row.voyage_flight_number,
    vesselName: row.vessel_name,
    portOfLoading: row.port_of_loading,
    portOfDischarge: row.port_of_discharge,
    manifestNumber: row.manifest_number,
    transactionNumber: row.transaction_number,
    shipperName: row.shipper_name,
    shipperAddress: row.shipper_address,
    consigneeName: row.consignee_name,
    consigneeAddress: row.consignee_address,
    notifyParty: row.notify_party,
    cargoDescription: row.cargo_description,
    packageCount: row.package_count,
    packageUnit: row.package_unit,
    grossWeightKg: toNumberOrNull(row.gross_weight_kg),
    netWeightKg: toNumberOrNull(row.net_weight_kg),
    volumeCbm: toNumberOrNull(row.volume_cbm),
    hsCode: row.hs_code,
    dangerousGoods: row.dangerous_goods,
    dangerousGoodsImoClass: row.dangerous_goods_imo_class,
    containerNumber: row.container_number,
    containerType: row.container_type,
    containerSealNumber: row.container_seal_number,
  };
}

function toShipmentSummaryDto(row: ShipmentSummaryRow): ShipmentSummaryDto {
  return {
    id: row.id,
    orderIds: row.order_ids ?? [],
    customerNames: row.customer_names ?? [],
    billOfLadingNumber: row.bill_of_lading_number,
    documentType: row.document_type,
    forwarderName: row.forwarder_name,
    createdAt: toIsoString(row.created_at),
  };
}
