import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateHblDto } from './dto/create-hbl.dto';
import { HblDto, HblOrderSummaryDto } from './dto/hbl.dto';
import { UpdateHblDto } from './dto/update-hbl.dto';
import { SeaMethod } from './mbl.enums';
import { assertCustomerExists, assertOrdersExist } from './mbl-validation.util';

type WritableHblField = Exclude<
  keyof CreateHblDto,
  'mblId' | 'containerId' | 'customerId' | 'orderIds'
>;

interface HblRow {
  id: number;
  mbl_id: number;
  container_id: number | null;
  customer_id: number;
  customer_name: string | null;
  sequence_number: number;
  ibl_number: string | null;
  hbl_number: string | null;
  shipper_name: string | null;
  shipper_address: string | null;
  consignee_name: string | null;
  consignee_address: string | null;
  notify_party_name: string | null;
  notify_party_address: string | null;
  cargo_description: string | null;
  quantity: string | null;
  gross_weight_kg: string | null;
  volume_cbm: string | null;
  remarks: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface HblOrderRow {
  id: number;
  customer_name: string | null;
}

/** DTO property → `hbl` column, for every field writable after creation
 *  (`mblId`/`containerId`/`customerId` are fixed at creation; `orderIds` has
 *  its own dedicated endpoint). */
const WRITABLE_COLUMNS: Record<WritableHblField, string> = {
  hblNumber: 'hbl_number',
  shipperName: 'shipper_name',
  shipperAddress: 'shipper_address',
  consigneeName: 'consignee_name',
  consigneeAddress: 'consignee_address',
  notifyPartyName: 'notify_party_name',
  notifyPartyAddress: 'notify_party_address',
  cargoDescription: 'cargo_description',
  quantity: 'quantity',
  grossWeightKg: 'gross_weight_kg',
  volumeCbm: 'volume_cbm',
  remarks: 'remarks',
};

const WRITABLE_KEYS = Object.keys(WRITABLE_COLUMNS) as WritableHblField[];

const HBL_SELECT = `
  SELECT h.id,
         h.mbl_id,
         h.container_id,
         h.customer_id,
         c.name AS customer_name,
         h.sequence_number,
         h.ibl_number,
         h.hbl_number,
         h.shipper_name,
         h.shipper_address,
         h.consignee_name,
         h.consignee_address,
         h.notify_party_name,
         h.notify_party_address,
         h.cargo_description,
         h.quantity,
         h.gross_weight_kg,
         h.volume_cbm,
         h.remarks,
         h.created_at,
         h.updated_at
    FROM hbl h
    LEFT JOIN customers c ON c.id = h.customer_id`;

const HBL_ORDERS_SELECT = `
  SELECT o.id, c.name AS customer_name
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
   WHERE o.hbl_id = $1
   ORDER BY o.id`;

@Injectable()
export class HblService {
  constructor(private readonly db: DatabaseService) {}

  /** Creates one "Internal B/L" under an MBL. `containerId` is required iff
   *  the parent MBL's `seaMethod = 'groupage_fcl'`, and must belong to that
   *  MBL. For `fcl_lcl`, every HBL must use the MBL's own `customerId` (set
   *  once, shared by all its HBLs). Order association is optional. */
  async create(dto: CreateHblDto): Promise<HblDto> {
    const mbl = await this.db.queryOne<{
      id: number;
      sea_method: SeaMethod | null;
      customer_id: number | null;
    }>('SELECT id, sea_method, customer_id FROM mbl WHERE id = $1', [dto.mblId]);
    if (!mbl) {
      throw new NotFoundException(`MBL ${dto.mblId} not found`);
    }

    await this.validateContainer(mbl.sea_method, mbl.id, dto.containerId);
    this.validateCustomer(mbl.sea_method, mbl.customer_id, dto.customerId);
    await assertCustomerExists(this.db, dto.customerId);
    if (dto.orderIds?.length) {
      await assertOrdersExist((sql, params) => this.db.query(sql, params), dto.orderIds);
    }

    const newId = await this.db.transaction(async (client) => {
      const seq = await client.query<{ next: number }>(
        'SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next FROM hbl WHERE mbl_id = $1',
        [dto.mblId],
      );
      const sequenceNumber = seq.rows[0].next;

      const keys = WRITABLE_KEYS.filter((key) => dto[key] !== undefined);
      const columns = [
        'mbl_id',
        'container_id',
        'customer_id',
        'sequence_number',
        ...keys.map((key) => WRITABLE_COLUMNS[key]),
      ];
      const values: unknown[] = [
        dto.mblId,
        dto.containerId ?? null,
        dto.customerId,
        sequenceNumber,
        ...keys.map((key) => dto[key]),
      ];
      const placeholders = values.map((_, i) => `$${i + 1}`);

      let inserted;
      try {
        inserted = await client.query<{ id: number }>(
          `INSERT INTO hbl (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
          values,
        );
      } catch (err) {
        throw translateWriteError(err);
      }
      const hblId = inserted.rows[0].id;

      // System-generated reference, e.g. "IB-001" — formatted from the row's
      // own id once it exists, so it's stable even if the format rule changes.
      await client.query(`UPDATE hbl SET ibl_number = 'IB-' || lpad(id::text, 3, '0') WHERE id = $1`, [
        hblId,
      ]);

      if (dto.orderIds?.length) {
        await client.query('UPDATE orders SET hbl_id = $1 WHERE id = ANY($2)', [hblId, dto.orderIds]);
      }

      return hblId;
    });

    return this.findById(newId);
  }

  async findById(id: number): Promise<HblDto> {
    const row = await this.db.queryOne<HblRow>(`${HBL_SELECT} WHERE h.id = $1`, [id]);
    if (!row) {
      throw new NotFoundException(`HBL ${id} not found`);
    }
    const orders = await this.db.query<HblOrderRow>(HBL_ORDERS_SELECT, [id]);
    return toHblDto(row, orders);
  }

  /** Lists every HBL under an MBL, ordered by sequence — the sidebar's source
   *  for the MBL → HBL tree (containers are read separately via `MblService`). */
  async findByMblId(mblId: number): Promise<HblDto[]> {
    const rows = await this.db.query<HblRow>(
      `${HBL_SELECT} WHERE h.mbl_id = $1 ORDER BY h.sequence_number`,
      [mblId],
    );
    const result: HblDto[] = [];
    for (const row of rows) {
      const orders = await this.db.query<HblOrderRow>(HBL_ORDERS_SELECT, [row.id]);
      result.push(toHblDto(row, orders));
    }
    return result;
  }

  async update(id: number, dto: UpdateHblDto): Promise<HblDto> {
    const existing = await this.db.queryOne<{ id: number; mbl_id: number }>(
      'SELECT id, mbl_id FROM hbl WHERE id = $1',
      [id],
    );
    if (!existing) {
      throw new NotFoundException(`HBL ${id} not found`);
    }

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

    try {
      await this.db.query(`UPDATE hbl SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    } catch (err) {
      throw translateWriteError(err);
    }
    return this.findById(id);
  }

  /** Replaces the full set of orders associated with an HBL. An empty array
   *  is valid — order association is optional for an HBL. */
  async updateOrders(id: number, orderIds: number[]): Promise<HblDto> {
    await this.db.transaction(async (client) => {
      const existing = await client.query<{ id: number }>('SELECT id FROM hbl WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        throw new NotFoundException(`HBL ${id} not found`);
      }

      await assertOrdersExist(
        (sql, params) => client.query<{ id: number }>(sql, params).then((r) => r.rows),
        orderIds,
      );

      await client.query('UPDATE orders SET hbl_id = NULL WHERE hbl_id = $1 AND NOT (id = ANY($2))', [
        id,
        orderIds,
      ]);
      if (orderIds.length > 0) {
        await client.query('UPDATE orders SET hbl_id = $1 WHERE id = ANY($2)', [id, orderIds]);
      }
    });

    return this.findById(id);
  }

  /** Hard delete — `orders.hbl_id` (ON DELETE SET NULL) frees this HBL's
   *  orders back to unassigned automatically. */
  async remove(id: number): Promise<void> {
    const row = await this.db.queryOne<{ id: number }>('DELETE FROM hbl WHERE id = $1 RETURNING id', [
      id,
    ]);
    if (!row) {
      throw new NotFoundException(`HBL ${id} not found`);
    }
  }

  private async validateContainer(
    seaMethod: SeaMethod | null,
    mblId: number,
    containerId: number | undefined,
  ): Promise<void> {
    if (seaMethod === SeaMethod.GROUPAGE_FCL) {
      if (containerId === undefined) {
        throw new BadRequestException('containerId is required for an HBL under a groupage_fcl MBL');
      }
      const container = await this.db.queryOne<{ id: number }>(
        'SELECT id FROM mbl_container WHERE id = $1 AND mbl_id = $2',
        [containerId, mblId],
      );
      if (!container) {
        throw new BadRequestException(`Container ${containerId} does not belong to MBL ${mblId}`);
      }
    } else if (containerId !== undefined) {
      throw new BadRequestException('containerId is only applicable for a groupage_fcl MBL');
    }
  }

  private validateCustomer(
    seaMethod: SeaMethod | null,
    mblCustomerId: number | null,
    hblCustomerId: number,
  ): void {
    if (seaMethod === SeaMethod.FCL_LCL && mblCustomerId !== null && hblCustomerId !== mblCustomerId) {
      throw new BadRequestException(
        `This MBL's HBLs must all use customer ${mblCustomerId} (fcl_lcl shares one customer)`,
      );
    }
  }
}

const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNIQUE_VIOLATION = '23505';

function translateWriteError(err: unknown): unknown {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === PG_FOREIGN_KEY_VIOLATION) {
    return new BadRequestException('Referenced MBL, container, or customer does not exist');
  }
  if (code === PG_UNIQUE_VIOLATION) {
    return new BadRequestException('Duplicate HBL sequence number for this MBL');
  }
  return err;
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toNumberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function toHblDto(row: HblRow, orders: HblOrderRow[]): HblDto {
  return {
    id: row.id,
    mblId: row.mbl_id,
    containerId: row.container_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    sequenceNumber: row.sequence_number,
    iblNumber: row.ibl_number,
    hblNumber: row.hbl_number,
    shipperName: row.shipper_name,
    shipperAddress: row.shipper_address,
    consigneeName: row.consignee_name,
    consigneeAddress: row.consignee_address,
    notifyPartyName: row.notify_party_name,
    notifyPartyAddress: row.notify_party_address,
    cargoDescription: row.cargo_description,
    quantity: row.quantity,
    grossWeightKg: toNumberOrNull(row.gross_weight_kg),
    volumeCbm: toNumberOrNull(row.volume_cbm),
    remarks: row.remarks,
    orders: orders.map(
      (order): HblOrderSummaryDto => ({ id: order.id, customerName: order.customer_name }),
    ),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}
