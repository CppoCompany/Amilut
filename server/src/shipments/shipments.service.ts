import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { ListShipmentsQuery } from './dto/list-shipments.query';
import { ShipmentDto } from './dto/shipment.dto';
import { ShipmentSummaryDto } from './dto/shipment-summary.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { ShipmentDocumentType } from './shipments.enums';

type WritableShipmentField = Exclude<keyof CreateShipmentDto, 'orderId'>;

/** Row shape produced by SHIPMENT_SELECT (DATE columns are pre-formatted in SQL). */
interface ShipmentRow {
  id: number;
  order_id: number;
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

interface ShipmentSummaryRow {
  id: number;
  order_id: number;
  customer_name: string | null;
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
         order_id,
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

const SHIPMENT_SUMMARY_SELECT = `
  SELECT s.id,
         s.order_id,
         c.name AS customer_name,
         s.bill_of_lading_number,
         s.document_type,
         s.forwarder_name,
         s.created_at
    FROM order_account s
    LEFT JOIN orders    o ON o.id = s.order_id
    LEFT JOIN customers c ON c.id = o.customer_id`;

const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class ShipmentsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(query: ListShipmentsQuery): Promise<ShipmentSummaryDto[]> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const rows = await this.db.query<ShipmentSummaryRow>(
      `${SHIPMENT_SUMMARY_SELECT}
       ORDER BY s.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows.map(toShipmentSummaryDto);
  }

  /** Opens a shipment file for an order. Fails if the order already has one. */
  async create(dto: CreateShipmentDto): Promise<ShipmentDto> {
    await this.assertOrderExists(dto.orderId);

    const keys = WRITABLE_KEYS.filter((key) => dto[key] !== undefined);
    const columns = ['order_id', ...keys.map((key) => WRITABLE_COLUMNS[key])];
    const values: unknown[] = [dto.orderId, ...keys.map((key) => dto[key])];
    const placeholders = values.map((_, i) => `$${i + 1}`);

    const sql = `INSERT INTO order_account (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`;

    let inserted: { id: number } | null;
    try {
      inserted = await this.db.queryOne<{ id: number }>(sql, values);
    } catch (err) {
      throw translateWriteError(err);
    }
    if (!inserted) {
      throw new BadRequestException('Shipment was not created');
    }
    return this.findById(inserted.id);
  }

  async findById(id: number): Promise<ShipmentDto> {
    const row = await this.db.queryOne<ShipmentRow>(`${SHIPMENT_SELECT} WHERE id = $1`, [id]);
    if (!row) {
      throw new NotFoundException(`Shipment ${id} not found`);
    }
    return toShipmentDto(row);
  }

  async findByOrderId(orderId: number): Promise<ShipmentDto> {
    const row = await this.db.queryOne<ShipmentRow>(
      `${SHIPMENT_SELECT} WHERE order_id = $1`,
      [orderId],
    );
    if (!row) {
      throw new NotFoundException(`Order ${orderId} has no shipment file yet`);
    }
    return toShipmentDto(row);
  }

  /** Patches only the provided fields; id / orderId / createdAt are immutable. */
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

  private async assertOrderExists(orderId: number): Promise<void> {
    const order = await this.db.queryOne<{ id: number }>('SELECT id FROM orders WHERE id = $1', [
      orderId,
    ]);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
  }
}

function translateWriteError(err: unknown): unknown {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === PG_FOREIGN_KEY_VIOLATION) {
    return new BadRequestException('Referenced order does not exist');
  }
  if (code === PG_UNIQUE_VIOLATION) {
    return new ConflictException('This order already has a shipment file');
  }
  return err;
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toNumberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function toShipmentDto(row: ShipmentRow): ShipmentDto {
  return {
    id: row.id,
    orderId: row.order_id,
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
    orderId: row.order_id,
    customerName: row.customer_name,
    billOfLadingNumber: row.bill_of_lading_number,
    documentType: row.document_type,
    forwarderName: row.forwarder_name,
    createdAt: toIsoString(row.created_at),
  };
}
