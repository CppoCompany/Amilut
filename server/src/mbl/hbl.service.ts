import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AirMethod, ArrivalState } from '../air/air.enums';
import { AirReferenceService } from '../air/air-reference.service';
import { airlinePrefixOf, normalizeHawbNumber } from '../air/awb-number';
import { writeChargeableWeight } from '../air/chargeable-weight.store';
import { DatabaseService } from '../database/database.service';
import {
  DocumentStatus,
  StatusTrack,
} from '../status-tracks/status-tracks.enums';
import { initTrackIn } from '../status-tracks/status-tracks.service';
import { CreateHblDto } from './dto/create-hbl.dto';
import { HblDto, HblOrderSummaryDto } from './dto/hbl.dto';
import { PieceDimensionDto } from './dto/piece-dimension.dto';
import { UpdateHblDto } from './dto/update-hbl.dto';
import { MblShippingType, SeaMethod } from './mbl.enums';
import { assertCustomerExists, assertOrdersExist } from './mbl-validation.util';

type WritableHblField = Exclude<
  keyof CreateHblDto,
  | 'mblId'
  | 'shippingType'
  | 'containerId'
  | 'customerId'
  | 'orderIds'
  | 'pieceDimensions'
  | 'approvedChargeableWeightKg'
  | 'chargeableWeightOverrideReason'
>;

interface HblRow {
  id: number;
  mbl_id: number | null;
  mbl_number: string | null;
  shipping_type: MblShippingType;
  is_master_mirror: boolean;
  container_id: number | null;
  customer_id: number;
  customer_name: string | null;
  sequence_number: number | null;
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
  pieces: number | null;
  calculated_chargeable_weight_kg: string | null;
  approved_chargeable_weight_kg: string | null;
  chargeable_weight_overridden: boolean;
  volumetric_divisor: number | null;
  weight_rounding_step_kg: string | null;
  special_handling_codes: string[] | null;
  document_status: DocumentStatus | null;
  pieces_received: string;
  ccf_id: number | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface HblOrderRow {
  id: number;
  customer_name: string | null;
}

interface PieceDimensionRow {
  piece_count: number;
  length_cm: string;
  width_cm: string;
  height_cm: string;
}

/** The master an HBL is created under / linked to. */
export interface MasterRow {
  id: number;
  shipping_type: MblShippingType;
  sea_method: SeaMethod | null;
  air_method: AirMethod | null;
  customer_id: number | null;
  mbl_number: string | null;
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
  pieces: 'pieces',
  specialHandlingCodes: 'special_handling_codes',
};

const WRITABLE_KEYS = Object.keys(WRITABLE_COLUMNS) as WritableHblField[];

/** HAWB-only fields (rejected on a sea HBL). */
const AIR_ONLY_FIELDS = [
  'pieces',
  'pieceDimensions',
  'approvedChargeableWeightKg',
  'chargeableWeightOverrideReason',
  'specialHandlingCodes',
] as const;

const HBL_SELECT = `
  SELECT h.id,
         h.mbl_id,
         m.mbl_number,
         h.shipping_type,
         h.is_master_mirror,
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
         h.pieces,
         h.calculated_chargeable_weight_kg,
         h.approved_chargeable_weight_kg,
         h.chargeable_weight_overridden,
         h.volumetric_divisor,
         h.weight_rounding_step_kg,
         h.special_handling_codes,
         h.document_status,
         (SELECT COALESCE(sum(a.pieces_received), 0)
            FROM hbl_arrival a
           WHERE a.hbl_id = h.id AND a.voided_at IS NULL) AS pieces_received,
         (SELECT ccf.id FROM customs_clearance_files ccf WHERE ccf.hbl_id = h.id) AS ccf_id,
         h.created_at,
         h.updated_at
    FROM hbl h
    LEFT JOIN mbl       m ON m.id = h.mbl_id
    LEFT JOIN customers c ON c.id = h.customer_id`;

const HBL_ORDERS_SELECT = `
  SELECT o.id, c.name AS customer_name
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
   WHERE o.hbl_id = $1
   ORDER BY o.id`;

const PIECE_DIMENSIONS_SELECT = `
  SELECT piece_count, length_cm, width_cm, height_cm
    FROM hbl_piece_dimension
   WHERE hbl_id = $1
   ORDER BY id`;

@Injectable()
export class HblService {
  constructor(
    private readonly db: DatabaseService,
    private readonly airReference: AirReferenceService,
  ) {}

  /** Creates one "Internal B/L" under an MBL. `containerId` is required iff
   *  the parent MBL's `seaMethod = 'groupage_fcl'`, and must belong to that
   *  MBL. For `fcl_lcl`, every HBL must use the MBL's own `customerId` (set
   *  once, shared by all its HBLs). Order association is optional.
   *
   *  Air: `mblId` may be omitted (the HAWB is linked later); under a MAWB the
   *  air method must allow another house (see `assertAirMasterAcceptsHouse`). */
  async create(dto: CreateHblDto, userId: number): Promise<HblDto> {
    let mbl: MasterRow | null = null;
    if (dto.mblId !== undefined) {
      mbl = await this.db.queryOne<MasterRow>(
        'SELECT id, shipping_type, sea_method, air_method, customer_id, mbl_number FROM mbl WHERE id = $1',
        [dto.mblId],
      );
      if (!mbl) {
        throw new NotFoundException(`MBL ${dto.mblId} not found`);
      }
      if (
        dto.shippingType !== undefined &&
        dto.shippingType !== mbl.shipping_type
      ) {
        throw new BadRequestException(
          `shippingType "${dto.shippingType}" does not match MBL ${mbl.id}`,
        );
      }
    } else if (dto.shippingType !== MblShippingType.AIR) {
      throw new BadRequestException(
        'mblId is required (only an air HAWB may be created before its MAWB)',
      );
    }
    const shippingType = mbl?.shipping_type ?? MblShippingType.AIR;
    const isAir = shippingType === MblShippingType.AIR;
    assertFieldsMatchMode(shippingType, dto);

    if (isAir) {
      if (dto.containerId !== undefined) {
        throw new BadRequestException('containerId is not applicable to air');
      }
      if (mbl) {
        await assertAirMasterAcceptsHouse(
          (sql, params) => this.db.query(sql, params),
          mbl,
          null,
        );
      }
      dto.hblNumber = normalizeHawbNumber(dto.hblNumber) ?? undefined;
    } else {
      await this.validateContainer(mbl!.sea_method, mbl!.id, dto.containerId);
      this.validateCustomer(mbl!.sea_method, mbl!.customer_id, dto.customerId);
    }
    await assertCustomerExists(this.db, dto.customerId);
    if (dto.orderIds?.length) {
      await assertOrdersExist(
        (sql, params) => this.db.query(sql, params),
        dto.orderIds,
      );
    }

    const newId = await this.db.transaction(async (client) => {
      const sequenceNumber = mbl
        ? await nextSequenceNumber(client, mbl.id)
        : null;

      const keys = WRITABLE_KEYS.filter((key) => dto[key] !== undefined);
      const columns = [
        'mbl_id',
        'container_id',
        'customer_id',
        'sequence_number',
        'shipping_type',
        'handler_user_id',
        ...keys.map((key) => WRITABLE_COLUMNS[key]),
      ];
      const values: unknown[] = [
        dto.mblId ?? null,
        dto.containerId ?? null,
        dto.customerId,
        sequenceNumber,
        shippingType,
        userId,
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
      await client.query(
        `UPDATE hbl SET ibl_number = 'IB-' || lpad(id::text, 3, '0') WHERE id = $1`,
        [hblId],
      );

      if (dto.orderIds?.length) {
        await client.query('UPDATE orders SET hbl_id = $1 WHERE id = ANY($2)', [
          hblId,
          dto.orderIds,
        ]);
      }

      if (isAir) {
        if (dto.pieceDimensions !== undefined) {
          await replacePieceDimensions(client, hblId, dto.pieceDimensions);
        }
        await this.writeHouseWeight(client, hblId, mbl?.mbl_number ?? null, {
          approved: dto.approvedChargeableWeightKg,
          overrideReason: dto.chargeableWeightOverrideReason,
          userId,
        });
        await initTrackIn(
          client,
          StatusTrack.DOCUMENT,
          hblId,
          DocumentStatus.PENDING,
          userId,
        );
        if (mbl) {
          await client.query(
            `INSERT INTO hbl_master_link_history (hbl_id, previous_mbl_id, new_mbl_id, changed_by)
             VALUES ($1, NULL, $2, $3)`,
            [hblId, mbl.id, userId],
          );
        }
      }

      return hblId;
    });

    return this.findById(newId);
  }

  async findById(id: number): Promise<HblDto> {
    const row = await this.db.queryOne<HblRow>(
      `${HBL_SELECT} WHERE h.id = $1`,
      [id],
    );
    if (!row) {
      throw new NotFoundException(`HBL ${id} not found`);
    }
    return this.toDtoWithChildren(row);
  }

  /** Lists every HBL under an MBL, ordered by sequence — the sidebar's source
   *  for the MBL → HBL tree (containers are read separately via `MblService`).
   *  A Direct MAWB's hidden mirror house is never listed. */
  async findByMblId(mblId: number): Promise<HblDto[]> {
    const rows = await this.db.query<HblRow>(
      `${HBL_SELECT} WHERE h.mbl_id = $1 AND NOT h.is_master_mirror ORDER BY h.sequence_number`,
      [mblId],
    );
    const result: HblDto[] = [];
    for (const row of rows) {
      result.push(await this.toDtoWithChildren(row));
    }
    return result;
  }

  /** Air HAWBs created before (or detached from) a MAWB, newest first. */
  async findUnassigned(): Promise<HblDto[]> {
    const rows = await this.db.query<HblRow>(
      `${HBL_SELECT} WHERE h.mbl_id IS NULL AND h.shipping_type = 'air' ORDER BY h.id DESC`,
    );
    const result: HblDto[] = [];
    for (const row of rows) {
      result.push(await this.toDtoWithChildren(row));
    }
    return result;
  }

  async update(id: number, dto: UpdateHblDto, userId: number): Promise<HblDto> {
    const existing = await this.db.queryOne<{
      id: number;
      mbl_id: number | null;
      shipping_type: MblShippingType;
      is_master_mirror: boolean;
      mbl_number: string | null;
    }>(
      `SELECT h.id, h.mbl_id, h.shipping_type, h.is_master_mirror, m.mbl_number
         FROM hbl h LEFT JOIN mbl m ON m.id = h.mbl_id
        WHERE h.id = $1`,
      [id],
    );
    if (!existing) {
      throw new NotFoundException(`HBL ${id} not found`);
    }
    if (existing.is_master_mirror) {
      throw new BadRequestException(
        'במשלוח ישיר פרטי המשלוח נערכים דרך ה-MAWB',
      );
    }
    assertFieldsMatchMode(existing.shipping_type, dto);
    const isAir = existing.shipping_type === MblShippingType.AIR;
    if (isAir) {
      if (dto.hblNumber !== undefined) {
        // A cleared number is written as NULL (back to the temporary IB- id).
        (dto as { hblNumber?: string | null }).hblNumber = normalizeHawbNumber(
          dto.hblNumber,
        );
      }
      if (dto.pieces !== undefined) {
        await this.assertPiecesCoverReceived(id, dto.pieces);
      }
    }

    const keys = WRITABLE_KEYS.filter((key) => dto[key] !== undefined);
    const airChanges =
      isAir &&
      (dto.pieceDimensions !== undefined ||
        dto.approvedChargeableWeightKg !== undefined ||
        keys.length > 0);
    if (keys.length === 0 && !airChanges) {
      return this.findById(id);
    }

    await this.db.transaction(async (client) => {
      if (keys.length > 0) {
        const params: unknown[] = [];
        const sets = keys.map((key) => {
          params.push(dto[key]);
          return `${WRITABLE_COLUMNS[key]} = $${params.length}`;
        });
        sets.push('updated_at = now()');
        params.push(id);

        try {
          await client.query(
            `UPDATE hbl SET ${sets.join(', ')} WHERE id = $${params.length}`,
            params,
          );
        } catch (err) {
          throw translateWriteError(err);
        }
      }
      if (airChanges) {
        if (dto.pieceDimensions !== undefined) {
          await replacePieceDimensions(client, id, dto.pieceDimensions);
        }
        await this.writeHouseWeight(client, id, existing.mbl_number, {
          approved: dto.approvedChargeableWeightKg,
          overrideReason: dto.chargeableWeightOverrideReason,
          userId,
        });
      }
    });
    return this.findById(id);
  }

  /** Replaces the full set of orders associated with an HBL. An empty array
   *  is valid — order association is optional for an HBL. */
  async updateOrders(id: number, orderIds: number[]): Promise<HblDto> {
    await this.db.transaction(async (client) => {
      const existing = await client.query<{ id: number }>(
        'SELECT id FROM hbl WHERE id = $1',
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`HBL ${id} not found`);
      }

      await assertOrdersExist(
        (sql, params) =>
          client.query<{ id: number }>(sql, params).then((r) => r.rows),
        orderIds,
      );

      await client.query(
        'UPDATE orders SET hbl_id = NULL WHERE hbl_id = $1 AND NOT (id = ANY($2))',
        [id, orderIds],
      );
      if (orderIds.length > 0) {
        await client.query('UPDATE orders SET hbl_id = $1 WHERE id = ANY($2)', [
          id,
          orderIds,
        ]);
      }
    });

    return this.findById(id);
  }

  /** Hard delete — `orders.hbl_id` (ON DELETE SET NULL) frees this HBL's
   *  orders back to unassigned automatically. An air HAWB with recorded
   *  arrivals or an opened CCF is kept (its audit trail must survive), and a
   *  Direct MAWB's mirror house goes only with its MAWB. */
  async remove(id: number): Promise<void> {
    const existing = await this.db.queryOne<{
      shipping_type: MblShippingType;
      is_master_mirror: boolean;
      has_arrivals: boolean;
      has_ccf: boolean;
    }>(
      `SELECT h.shipping_type, h.is_master_mirror,
              EXISTS (SELECT 1 FROM hbl_arrival a WHERE a.hbl_id = h.id) AS has_arrivals,
              EXISTS (SELECT 1 FROM customs_clearance_files c WHERE c.hbl_id = h.id) AS has_ccf
         FROM hbl h WHERE h.id = $1`,
      [id],
    );
    if (!existing) {
      throw new NotFoundException(`HBL ${id} not found`);
    }
    if (existing.shipping_type === MblShippingType.AIR) {
      if (existing.is_master_mirror) {
        throw new BadRequestException(
          'במשלוח ישיר ה-House הפנימי נמחק רק יחד עם ה-MAWB',
        );
      }
      if (existing.has_arrivals || existing.has_ccf) {
        throw new BadRequestException(
          'לא ניתן למחוק HAWB שנרשמו לו הגעות או שנפתח לו תיק סליקה',
        );
      }
    }
    const row = await this.db.queryOne<{ id: number }>(
      'DELETE FROM hbl WHERE id = $1 RETURNING id',
      [id],
    );
    if (!row) {
      throw new NotFoundException(`HBL ${id} not found`);
    }
  }

  /** Recalculates the house's chargeable weight with the rule of its MAWB's
   *  airline (the default rule while it has no MAWB). */
  async writeHouseWeight(
    client: PoolClient,
    hblId: number,
    mblNumber: string | null,
    input: {
      approved: number | null | undefined;
      overrideReason?: string | null;
      implicit?: boolean;
      userId: number;
    },
  ): Promise<void> {
    const rule = await this.airReference.resolveWeightRule(
      airlinePrefixOf(mblNumber),
    );
    await writeChargeableWeight(client, {
      table: 'hbl',
      id: hblId,
      rule,
      ...input,
    });
  }

  private async assertPiecesCoverReceived(
    id: number,
    pieces: number,
  ): Promise<void> {
    const row = await this.db.queryOne<{ received: string }>(
      `SELECT COALESCE(sum(pieces_received), 0) AS received
         FROM hbl_arrival WHERE hbl_id = $1 AND voided_at IS NULL`,
      [id],
    );
    const received = Number(row?.received ?? 0);
    if (pieces < received) {
      throw new BadRequestException(
        `כבר התקבלו ${received} חלקים — לא ניתן להקטין את מספר החלקים הצפוי ל-${pieces}`,
      );
    }
  }

  private async toDtoWithChildren(row: HblRow): Promise<HblDto> {
    const orders = await this.db.query<HblOrderRow>(HBL_ORDERS_SELECT, [
      row.id,
    ]);
    const dimensions =
      row.shipping_type === MblShippingType.AIR
        ? await this.db.query<PieceDimensionRow>(PIECE_DIMENSIONS_SELECT, [
            row.id,
          ])
        : [];
    return toHblDto(row, orders, dimensions);
  }

  private async validateContainer(
    seaMethod: SeaMethod | null,
    mblId: number,
    containerId: number | undefined,
  ): Promise<void> {
    if (seaMethod === SeaMethod.GROUPAGE_FCL) {
      if (containerId === undefined) {
        throw new BadRequestException(
          'containerId is required for an HBL under a groupage_fcl MBL',
        );
      }
      const container = await this.db.queryOne<{ id: number }>(
        'SELECT id FROM mbl_container WHERE id = $1 AND mbl_id = $2',
        [containerId, mblId],
      );
      if (!container) {
        throw new BadRequestException(
          `Container ${containerId} does not belong to MBL ${mblId}`,
        );
      }
    } else if (containerId !== undefined) {
      throw new BadRequestException(
        'containerId is only applicable for a groupage_fcl MBL',
      );
    }
  }

  private validateCustomer(
    seaMethod: SeaMethod | null,
    mblCustomerId: number | null,
    hblCustomerId: number,
  ): void {
    if (
      seaMethod === SeaMethod.FCL_LCL &&
      mblCustomerId !== null &&
      hblCustomerId !== mblCustomerId
    ) {
      throw new BadRequestException(
        `This MBL's HBLs must all use customer ${mblCustomerId} (fcl_lcl shares one customer)`,
      );
    }
  }
}

/**
 * A MAWB accepts a (new or moved-in) real HAWB only when its air method
 * allows it: never under Direct (the importer is on the MAWB itself), at most
 * one under Back-to-back, any number under Consolidation.
 */
export async function assertAirMasterAcceptsHouse(
  query: (sql: string, params: unknown[]) => Promise<unknown[]>,
  mbl: MasterRow,
  movingHblId: number | null,
): Promise<void> {
  if (mbl.shipping_type !== MblShippingType.AIR) {
    throw new BadRequestException('ניתן לשייך HAWB רק ל-MAWB של משלוח אווירי');
  }
  if (mbl.air_method === AirMethod.DIRECT) {
    throw new BadRequestException(
      'במשלוח ישיר אין HAWB — פרטי היבואן נשמרים ב-MAWB עצמו',
    );
  }
  if (mbl.air_method === AirMethod.BACK_TO_BACK) {
    const others = await query(
      `SELECT 1 FROM hbl WHERE mbl_id = $1 AND NOT is_master_mirror AND id <> $2 LIMIT 1`,
      [mbl.id, movingHblId ?? 0],
    );
    if (others.length > 0) {
      throw new BadRequestException(
        'ב-Back-to-back ניתן לשייך HAWB אחד בלבד ל-MAWB',
      );
    }
  }
}

/** Next "Internal B/L {N}" ordinal under a master. Locks the master row so two
 *  concurrent creates/links cannot pick the same number. */
export async function nextSequenceNumber(
  client: PoolClient,
  mblId: number,
): Promise<number> {
  await client.query('SELECT id FROM mbl WHERE id = $1 FOR UPDATE', [mblId]);
  const seq = await client.query<{ next: number }>(
    'SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next FROM hbl WHERE mbl_id = $1',
    [mblId],
  );
  return seq.rows[0].next;
}

function assertFieldsMatchMode(
  shippingType: MblShippingType,
  dto: UpdateHblDto,
): void {
  if (shippingType === MblShippingType.AIR) return;
  const present = AIR_ONLY_FIELDS.filter((key) => dto[key] !== undefined);
  if (present.length > 0) {
    throw new BadRequestException(
      `${present.join(', ')} not applicable to a sea HBL`,
    );
  }
}

async function replacePieceDimensions(
  client: PoolClient,
  hblId: number,
  dimensions: PieceDimensionDto[],
): Promise<void> {
  await client.query('DELETE FROM hbl_piece_dimension WHERE hbl_id = $1', [
    hblId,
  ]);
  for (const d of dimensions) {
    await client.query(
      `INSERT INTO hbl_piece_dimension (hbl_id, piece_count, length_cm, width_cm, height_cm)
       VALUES ($1, $2, $3, $4, $5)`,
      [hblId, d.pieceCount, d.lengthCm, d.widthCm, d.heightCm],
    );
  }
}

const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNIQUE_VIOLATION = '23505';

function translateWriteError(err: unknown): unknown {
  const pgErr = err as { code?: unknown; constraint?: unknown } | null;
  if (pgErr?.code === PG_FOREIGN_KEY_VIOLATION) {
    return new BadRequestException(
      'Referenced MBL, container, or customer does not exist',
    );
  }
  if (pgErr?.code === PG_UNIQUE_VIOLATION) {
    if (pgErr.constraint === 'hbl_air_number_unique_idx') {
      return new BadRequestException('מספר ה-HAWB כבר קיים במערכת');
    }
    return new BadRequestException(
      'Duplicate HBL sequence number for this MBL',
    );
  }
  return err;
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toNumberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

export function arrivalStateOf(
  shippingType: MblShippingType,
  pieces: number | null,
  received: number,
): ArrivalState | null {
  if (shippingType !== MblShippingType.AIR) return null;
  if (received === 0) return ArrivalState.NOT_ARRIVED;
  if (pieces === null || received < pieces) return ArrivalState.PARTIAL;
  return received === pieces
    ? ArrivalState.COMPLETE
    : ArrivalState.OVER_RECEIVED;
}

function toHblDto(
  row: HblRow,
  orders: HblOrderRow[],
  dimensions: PieceDimensionRow[],
): HblDto {
  const piecesReceived = Number(row.pieces_received ?? 0);
  return {
    id: row.id,
    mblId: row.mbl_id,
    mblNumber: row.mbl_number ?? null,
    shippingType: row.shipping_type,
    isMasterMirror: row.is_master_mirror ?? false,
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
      (order): HblOrderSummaryDto => ({
        id: order.id,
        customerName: order.customer_name,
      }),
    ),
    pieces: row.pieces ?? null,
    pieceDimensions: dimensions.map((d) => ({
      pieceCount: d.piece_count,
      lengthCm: Number(d.length_cm),
      widthCm: Number(d.width_cm),
      heightCm: Number(d.height_cm),
    })),
    calculatedChargeableWeightKg: toNumberOrNull(
      row.calculated_chargeable_weight_kg ?? null,
    ),
    approvedChargeableWeightKg: toNumberOrNull(
      row.approved_chargeable_weight_kg ?? null,
    ),
    chargeableWeightOverridden: row.chargeable_weight_overridden ?? false,
    volumetricDivisor: row.volumetric_divisor ?? null,
    weightRoundingStepKg: toNumberOrNull(row.weight_rounding_step_kg ?? null),
    specialHandlingCodes: row.special_handling_codes ?? [],
    documentStatus: row.document_status ?? null,
    piecesReceived,
    arrivalState: arrivalStateOf(
      row.shipping_type,
      row.pieces ?? null,
      piecesReceived,
    ),
    ccfId: row.ccf_id ?? null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}
