import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Paged } from '../common/paging/paged.dto';
import {
  orderByClause,
  pageWindow,
  pushDateRange,
  toPaged,
  WithTotal,
} from '../common/paging/paging.util';
import { AirMethod } from '../air/air.enums';
import { AirReferenceService } from '../air/air-reference.service';
import { airlinePrefixOf, normalizeAwbNumber } from '../air/awb-number';
import { writeChargeableWeight } from '../air/chargeable-weight.store';
import { DatabaseService } from '../database/database.service';
import { PaymentTerms } from '../orders/orders.enums';
import {
  ShipmentStatus,
  ShipmentStatusSource,
  StatusTrack,
} from '../status-tracks/status-tracks.enums';
import { StatusTracksService } from '../status-tracks/status-tracks.service';
import {
  assertDirectHasCustomer,
  assertFieldsMatchMode,
  detachHousesBeforeDelete,
  replaceFlightLegs,
  syncShipmentStatusFromLegs,
  upsertMirrorHouse,
} from './air-master';
import { CreateMblDto } from './dto/create-mbl.dto';
import { FlightLegDto } from './dto/flight-leg.dto';
import { ListMblQuery } from './dto/list-mbl.query';
import {
  CreateMblContainerDto,
  MblContainerDto,
} from './dto/mbl-container.dto';
import { MblDto } from './dto/mbl.dto';
import { MblSummaryDto } from './dto/mbl-summary.dto';
import { MBL_SORT_COLUMNS, PagedMblQuery } from './dto/paged-mbl.query';
import { UpdateMblDto } from './dto/update-mbl.dto';
import type { PoolClient } from 'pg';
import { MblShippingType, MblStatus, SeaMethod } from './mbl.enums';
import { assertCustomerExists } from './mbl-validation.util';

type WritableMblField = Exclude<
  keyof CreateMblDto,
  | 'shippingType'
  | 'seaMethod'
  | 'airMethod'
  | 'containers'
  | 'flightLegs'
  | 'approvedChargeableWeightKg'
  | 'chargeableWeightOverrideReason'
>;

interface MblRow {
  id: number;
  shipping_type: MblShippingType;
  sea_method: SeaMethod | null;
  customer_id: number | null;
  customer_name: string | null;
  mbl_number: string | null;
  booking_number: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  final_destination: string | null;
  shipper_name: string | null;
  shipper_address: string | null;
  consignee_name: string | null;
  consignee_address: string | null;
  notify_party_name: string | null;
  notify_party_address: string | null;
  container_number: string | null;
  container_seal_number: string | null;
  cargo_description: string | null;
  gross_weight_kg: string | null;
  volume_cbm: string | null;
  freight_terms: PaymentTerms | null;
  receipt_delivery_type: string | null;
  place_of_issue: string | null;
  date_of_issue: string | null;
  carrier_name: string | null;
  status: MblStatus;
  handler_user_id: number | null;
  handler_name: string | null;
  /** The Customs Clearance File linked to this case, if any (`customs_clearance_files.shipment_file_id → mbl.id`). */
  ccf_id: number | null;
  air_method: AirMethod | null;
  departure_airport_code: string | null;
  destination_airport_code: string | null;
  cargo_terminal_id: number | null;
  cargo_terminal_name: string | null;
  cargo_terminal_other: string | null;
  pieces: number | null;
  calculated_chargeable_weight_kg: string | null;
  approved_chargeable_weight_kg: string | null;
  chargeable_weight_overridden: boolean;
  volumetric_divisor: number | null;
  weight_rounding_step_kg: string | null;
  special_handling_codes: string[] | null;
  shipment_status: ShipmentStatus | null;
  shipment_status_source: ShipmentStatusSource | null;
  mirror_hbl_id: number | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface FlightLegRow {
  leg_no: number;
  flight_number: string | null;
  from_airport: string | null;
  to_airport: string | null;
  etd: Date | null;
  eta: Date | null;
  atd: Date | null;
  ata: Date | null;
}

interface MblContainerRow {
  id: number;
  container_number: string | null;
  container_seal_number: string | null;
  cargo_description: string | null;
  gross_weight_kg: string | null;
  volume_cbm: string | null;
}

interface MblSummaryRow {
  id: number;
  shipping_type: MblShippingType;
  sea_method: SeaMethod | null;
  air_method: AirMethod | null;
  status: MblStatus;
  mbl_number: string | null;
  carrier_name: string | null;
  handler_user_id: number | null;
  handler_name: string | null;
  hbl_count: string;
  order_count: string;
  order_ids: number[] | null;
  customer_names: string[] | null;
  created_at: Date | string;
}

/** DTO property → `mbl` column, for every field writable after creation
 *  (i.e. everything `UpdateMblDto` carries — `shippingType`/`seaMethod` are
 *  fixed at creation and handled separately in `create()`). */
const WRITABLE_COLUMNS: Record<WritableMblField, string> = {
  customerId: 'customer_id',
  mblNumber: 'mbl_number',
  bookingNumber: 'booking_number',
  vesselName: 'vessel_name',
  voyageNumber: 'voyage_number',
  portOfLoading: 'port_of_loading',
  portOfDischarge: 'port_of_discharge',
  finalDestination: 'final_destination',
  shipperName: 'shipper_name',
  shipperAddress: 'shipper_address',
  consigneeName: 'consignee_name',
  consigneeAddress: 'consignee_address',
  notifyPartyName: 'notify_party_name',
  notifyPartyAddress: 'notify_party_address',
  containerNumber: 'container_number',
  containerSealNumber: 'container_seal_number',
  cargoDescription: 'cargo_description',
  grossWeightKg: 'gross_weight_kg',
  volumeCbm: 'volume_cbm',
  freightTerms: 'freight_terms',
  receiptDeliveryType: 'receipt_delivery_type',
  placeOfIssue: 'place_of_issue',
  dateOfIssue: 'date_of_issue',
  carrierName: 'carrier_name',
  status: 'status',
  departureAirportCode: 'departure_airport_code',
  destinationAirportCode: 'destination_airport_code',
  cargoTerminalId: 'cargo_terminal_id',
  cargoTerminalOther: 'cargo_terminal_other',
  pieces: 'pieces',
  specialHandlingCodes: 'special_handling_codes',
};

const WRITABLE_KEYS = Object.keys(WRITABLE_COLUMNS) as WritableMblField[];

const MBL_SELECT = `
  SELECT m.id,
         m.shipping_type,
         m.sea_method,
         m.customer_id,
         c.name AS customer_name,
         m.mbl_number,
         m.booking_number,
         m.vessel_name,
         m.voyage_number,
         m.port_of_loading,
         m.port_of_discharge,
         m.final_destination,
         m.shipper_name,
         m.shipper_address,
         m.consignee_name,
         m.consignee_address,
         m.notify_party_name,
         m.notify_party_address,
         m.container_number,
         m.container_seal_number,
         m.cargo_description,
         m.gross_weight_kg,
         m.volume_cbm,
         m.freight_terms,
         m.receipt_delivery_type,
         m.place_of_issue,
         to_char(m.date_of_issue, 'YYYY-MM-DD') AS date_of_issue,
         m.carrier_name,
         m.status,
         m.handler_user_id,
         u.name AS handler_name,
         ccf.id AS ccf_id,
         m.air_method,
         m.departure_airport_code,
         m.destination_airport_code,
         m.cargo_terminal_id,
         ct.name_he AS cargo_terminal_name,
         m.cargo_terminal_other,
         m.pieces,
         m.calculated_chargeable_weight_kg,
         m.approved_chargeable_weight_kg,
         m.chargeable_weight_overridden,
         m.volumetric_divisor,
         m.weight_rounding_step_kg,
         m.special_handling_codes,
         m.shipment_status,
         m.shipment_status_source,
         (SELECT mh.id FROM hbl mh WHERE mh.mbl_id = m.id AND mh.is_master_mirror) AS mirror_hbl_id,
         m.created_at,
         m.updated_at
    FROM mbl m
    LEFT JOIN customers c ON c.id = m.customer_id
    LEFT JOIN users     u ON u.id = m.handler_user_id
    LEFT JOIN cargo_terminal ct ON ct.id = m.cargo_terminal_id
    LEFT JOIN customs_clearance_files ccf ON ccf.shipment_file_id = m.id`;

const FLIGHT_LEG_SELECT = `
  SELECT leg_no, flight_number, from_airport, to_airport, etd, eta, atd, ata
    FROM mbl_flight_leg
   WHERE mbl_id = $1
   ORDER BY leg_no`;

const CONTAINER_SELECT = `
  SELECT id, container_number, container_seal_number, cargo_description, gross_weight_kg, volume_cbm
    FROM mbl_container
   WHERE mbl_id = $1
   ORDER BY id`;

/** Aggregated across every HBL under the MBL (not `mbl.customer_id`, which is
 *  only ever set for `fcl_lcl`) — this is the "התיקים שלי" grid's data source. */
const MBL_SUMMARY_COLUMNS = `m.id,
         m.shipping_type,
         m.sea_method,
         m.air_method,
         m.status,
         m.mbl_number,
         m.carrier_name,
         m.handler_user_id,
         u.name AS handler_name,
         m.created_at,
         count(DISTINCT h.id) FILTER (WHERE NOT h.is_master_mirror) AS hbl_count,
         count(DISTINCT o.id) AS order_count,
         array_agg(DISTINCT o.id) FILTER (WHERE o.id IS NOT NULL) AS order_ids,
         array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) AS customer_names`;

const MBL_SUMMARY_FROM = `
    FROM mbl m
    LEFT JOIN users     u ON u.id = m.handler_user_id
    LEFT JOIN hbl       h ON h.mbl_id = m.id
    LEFT JOIN orders    o ON o.hbl_id = h.id
    LEFT JOIN customers c ON c.id = h.customer_id`;

const MBL_SUMMARY_GROUP_BY = `GROUP BY m.id, m.shipping_type, m.sea_method, m.air_method, m.status, m.mbl_number, m.carrier_name, m.handler_user_id, u.name, m.created_at`;

const MBL_SUMMARY_SELECT = `
  SELECT ${MBL_SUMMARY_COLUMNS}${MBL_SUMMARY_FROM}`;

/** Same aggregated rows plus the window `total` (evaluated after GROUP BY), for paged lists. */
const MBL_SUMMARY_SELECT_PAGED = `
  SELECT count(*) OVER() AS total,
         ${MBL_SUMMARY_COLUMNS}${MBL_SUMMARY_FROM}`;

@Injectable()
export class MblService {
  constructor(
    private readonly db: DatabaseService,
    private readonly airReference: AirReferenceService,
    private readonly tracks: StatusTracksService,
  ) {}

  /** "התיקים שלי" — every MBL, newest first, with its HBLs' orders/customers
   *  aggregated in. `customerId` matches any HBL using that customer (which
   *  for `fcl_lcl` is every HBL, since they all share the MBL's own customer). */
  async findAll(query: ListMblQuery): Promise<MblSummaryDto[]> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (query.customerId !== undefined) {
      params.push(query.customerId);
      where.push(
        `EXISTS (SELECT 1 FROM hbl h2 WHERE h2.mbl_id = m.id AND h2.customer_id = $${params.length})`,
      );
    }
    if (query.carrierName !== undefined) {
      params.push(`%${query.carrierName}%`);
      where.push(`m.carrier_name ILIKE $${params.length}`);
    }
    if (query.caseNumber !== undefined) {
      params.push(query.caseNumber);
      where.push(`m.id = $${params.length}`);
    }

    params.push(query.limit ?? 50);
    const limitIdx = params.length;
    params.push(query.offset ?? 0);
    const offsetIdx = params.length;

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await this.db.query<MblSummaryRow>(
      `${MBL_SUMMARY_SELECT}
       ${whereClause}
       ${MBL_SUMMARY_GROUP_BY}
       ORDER BY m.id DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );
    return rows.map(toMblSummaryDto);
  }

  /**
   * One page of MBL cases for the "view all" lists. Scoping is driven by the
   * query: `mine` restricts to cases opened by `currentUserId` ("התיקים
   * שלי"), `status` to one lifecycle status ("תיקים בהתרה" uses
   * `in_release`), neither for "תהליכי יבוא". Free-text search covers the
   * case number, MBL number, carrier and the customers of the MBL/its HBLs.
   */
  async findAllPaged(
    query: PagedMblQuery,
    currentUserId: number,
  ): Promise<Paged<MblSummaryDto>> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (query.mine) {
      params.push(currentUserId);
      where.push(`m.handler_user_id = $${params.length}`);
    }
    if (query.status !== undefined) {
      params.push(query.status);
      where.push(`m.status = $${params.length}`);
    }
    if (query.customerId !== undefined) {
      params.push(query.customerId);
      where.push(
        `(m.customer_id = $${params.length} OR EXISTS (SELECT 1 FROM hbl h2 WHERE h2.mbl_id = m.id AND h2.customer_id = $${params.length}))`,
      );
    }
    if (query.carrierName !== undefined) {
      params.push(`%${query.carrierName}%`);
      where.push(`m.carrier_name ILIKE $${params.length}`);
    }
    const text = query.q?.trim();
    if (text) {
      params.push(`%${text}%`);
      const idx = params.length;
      where.push(
        `(m.id::text ILIKE $${idx} OR m.mbl_number ILIKE $${idx} OR m.carrier_name ILIKE $${idx}` +
          ` OR EXISTS (SELECT 1 FROM customers mc WHERE mc.id = m.customer_id AND mc.name ILIKE $${idx})` +
          ` OR EXISTS (SELECT 1 FROM hbl h3 JOIN customers hc ON hc.id = h3.customer_id WHERE h3.mbl_id = m.id AND hc.name ILIKE $${idx}))`,
      );
    }
    pushDateRange(where, params, 'm.created_at', query.from, query.to);

    const window = pageWindow(query);
    params.push(window.limit);
    const limitIdx = params.length;
    params.push(window.offset);
    const offsetIdx = params.length;

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await this.db.query<MblSummaryRow & WithTotal>(
      `${MBL_SUMMARY_SELECT_PAGED}
       ${whereClause}
       ${MBL_SUMMARY_GROUP_BY}
       ${orderByClause(MBL_SORT_COLUMNS, query.sort, 'createdAt', query.dir, 'desc', 'm.id DESC')}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );
    return toPaged(rows, window, toMblSummaryDto);
  }

  /** Opens a new MBL. `seaMethod` is required iff `shippingType = 'sea'`;
   *  `containers` is required iff `seaMethod = 'groupage_fcl'` (the only
   *  method with a multi-container table — the other three sea methods keep
   *  their single container directly on `mbl`, see `WRITABLE_COLUMNS`).
   *  The handler is always the signed-in user; `status` defaults to `open`. */
  async create(dto: CreateMblDto, handlerUserId: number): Promise<MblDto> {
    validateShippingTypeAndMethod(
      dto.shippingType,
      dto.seaMethod,
      dto.airMethod,
    );
    validateContainers(dto.seaMethod, dto.containers);
    assertFieldsMatchMode(dto.shippingType, dto);
    if (dto.customerId !== undefined) {
      await assertCustomerExists(this.db, dto.customerId);
    }
    const isAir = dto.shippingType === MblShippingType.AIR;
    if (isAir) {
      assertDirectHasCustomer(dto.airMethod ?? null, dto.customerId);
      dto.mblNumber = normalizeAwbNumber(dto.mblNumber) ?? undefined;
      await this.assertAirReferences(dto);
    }

    const newId = await this.db.transaction(async (client) => {
      const keys = WRITABLE_KEYS.filter((key) => dto[key] !== undefined);
      const columns = [
        'shipping_type',
        'handler_user_id',
        ...(dto.seaMethod !== undefined ? ['sea_method'] : []),
        ...(dto.airMethod !== undefined ? ['air_method'] : []),
        ...keys.map((key) => WRITABLE_COLUMNS[key]),
      ];
      const values: unknown[] = [
        dto.shippingType,
        handlerUserId,
        ...(dto.seaMethod !== undefined ? [dto.seaMethod] : []),
        ...(dto.airMethod !== undefined ? [dto.airMethod] : []),
        ...keys.map((key) => dto[key]),
      ];
      const placeholders = values.map((_, i) => `$${i + 1}`);

      let inserted;
      try {
        inserted = await client.query<{ id: number }>(
          `INSERT INTO mbl (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
          values,
        );
      } catch (err) {
        throw translateWriteError(err);
      }
      const mblId = inserted.rows[0].id;

      if (dto.containers?.length) {
        for (const container of dto.containers) {
          await insertContainer(client, mblId, container);
        }
      }

      if (isAir) {
        await this.applyAirWrites(client, mblId, dto, handlerUserId);
      }

      return mblId;
    });

    return this.findById(newId);
  }

  async findById(id: number): Promise<MblDto> {
    const row = await this.db.queryOne<MblRow>(
      `${MBL_SELECT} WHERE m.id = $1`,
      [id],
    );
    if (!row) {
      throw new NotFoundException(`MBL ${id} not found`);
    }
    const containers =
      row.sea_method === SeaMethod.GROUPAGE_FCL
        ? await this.db.query<MblContainerRow>(CONTAINER_SELECT, [id])
        : [];
    const legs =
      row.shipping_type === MblShippingType.AIR
        ? await this.db.query<FlightLegRow>(FLIGHT_LEG_SELECT, [id])
        : [];
    return toMblDto(row, containers, legs);
  }

  /** Patches the provided fields. `containers` (when provided) REPLACES the
   *  full set, not a merge. */
  async update(id: number, dto: UpdateMblDto, userId: number): Promise<MblDto> {
    if (dto.customerId !== undefined) {
      await assertCustomerExists(this.db, dto.customerId);
    }
    const mode = await this.db.queryOne<{
      shipping_type: MblShippingType;
      air_method: AirMethod | null;
    }>('SELECT shipping_type, air_method FROM mbl WHERE id = $1', [id]);
    if (!mode) {
      throw new NotFoundException(`MBL ${id} not found`);
    }
    assertFieldsMatchMode(mode.shipping_type, dto);
    const isAir = mode.shipping_type === MblShippingType.AIR;
    if (isAir) {
      if (dto.customerId !== undefined) {
        assertDirectHasCustomer(mode.air_method, dto.customerId);
      }
      if (dto.mblNumber !== undefined) {
        dto.mblNumber = normalizeAwbNumber(dto.mblNumber) ?? undefined;
      }
      await this.assertAirReferences(dto);
    }

    await this.db.transaction(async (client) => {
      const existing = await client.query<{
        id: number;
        sea_method: SeaMethod | null;
      }>('SELECT id, sea_method FROM mbl WHERE id = $1 FOR UPDATE', [id]);
      if (existing.rows.length === 0) {
        throw new NotFoundException(`MBL ${id} not found`);
      }
      const seaMethod = existing.rows[0].sea_method;

      const keys = WRITABLE_KEYS.filter((key) => dto[key] !== undefined);
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
            `UPDATE mbl SET ${sets.join(', ')} WHERE id = $${params.length}`,
            params,
          );
        } catch (err) {
          throw translateWriteError(err);
        }
      }

      if (dto.containers !== undefined) {
        validateContainers(seaMethod ?? undefined, dto.containers);
        await client.query('DELETE FROM mbl_container WHERE mbl_id = $1', [id]);
        for (const container of dto.containers) {
          await insertContainer(client, id, container);
        }
      }

      if (isAir) {
        await this.applyAirWrites(client, id, dto, userId);
      }
    });

    return this.findById(id);
  }

  /** A user sets the MAWB shipment status; moving it backwards needs a reason. */
  async changeShipmentStatus(
    id: number,
    status: ShipmentStatus,
    reason: string | undefined,
    userId: number,
  ): Promise<MblDto> {
    await this.tracks.changeManually({
      track: StatusTrack.SHIPMENT,
      entityId: id,
      to: status,
      reason,
      userId,
    });
    return this.findById(id);
  }

  /** Lookup checks that need the database (done before the transaction).
   *  Also makes the two terminal fields exclusive in the same write: picking
   *  a listed terminal clears "other" and vice versa (the DB allows one). */
  private async assertAirReferences(dto: UpdateMblDto): Promise<void> {
    if (dto.destinationAirportCode !== undefined) {
      await this.airReference.assertImportDestination(
        dto.destinationAirportCode,
      );
    }
    if (dto.cargoTerminalId != null) {
      await this.airReference.assertCargoTerminal(dto.cargoTerminalId);
    }
    if (dto.cargoTerminalId != null && dto.cargoTerminalOther?.trim()) {
      throw new BadRequestException(
        'יש לבחור מסוף מהרשימה או להזין מסוף אחר — לא את שניהם',
      );
    }
    if (dto.cargoTerminalId != null) {
      dto.cargoTerminalOther = null;
    } else if (dto.cargoTerminalOther !== undefined) {
      dto.cargoTerminalOther = dto.cargoTerminalOther?.trim() || null;
      if (dto.cargoTerminalOther !== null) dto.cargoTerminalId = null;
    }
  }

  /** Everything an air save does after the plain columns are written:
   *  terminal exclusivity, legs + automatic status, chargeable weight and
   *  — for Direct — the mirror house. Runs inside the caller's transaction. */
  private async applyAirWrites(
    client: PoolClient,
    mblId: number,
    dto: UpdateMblDto,
    userId: number,
  ): Promise<void> {
    if (dto.flightLegs !== undefined) {
      await replaceFlightLegs(client, mblId, dto.flightLegs);
      await syncShipmentStatusFromLegs(client, this.tracks, mblId, userId);
    }

    const row = (
      await client.query<{
        mbl_number: string | null;
        air_method: AirMethod | null;
      }>('SELECT mbl_number, air_method FROM mbl WHERE id = $1', [mblId])
    ).rows[0];
    const rule = await this.airReference.resolveWeightRule(
      airlinePrefixOf(row.mbl_number),
    );
    await writeChargeableWeight(client, {
      table: 'mbl',
      id: mblId,
      rule,
      approved: dto.approvedChargeableWeightKg,
      overrideReason: dto.chargeableWeightOverrideReason,
      userId,
    });

    if (row.air_method === AirMethod.DIRECT) {
      await upsertMirrorHouse(client, mblId, userId);
    }
  }

  /** Hard delete — cascades to its containers and HBLs (`ON DELETE CASCADE`),
   *  which in turn frees any of their orders back to unassigned automatically
   *  (`orders.hbl_id ON DELETE SET NULL`). */
  async remove(id: number, userId: number): Promise<void> {
    const mode = await this.db.queryOne<{ shipping_type: MblShippingType }>(
      'SELECT shipping_type FROM mbl WHERE id = $1',
      [id],
    );
    if (!mode) {
      throw new NotFoundException(`MBL ${id} not found`);
    }
    if (mode.shipping_type === MblShippingType.SEA) {
      const row = await this.db.queryOne<{ id: number }>(
        'DELETE FROM mbl WHERE id = $1 RETURNING id',
        [id],
      );
      if (!row) {
        throw new NotFoundException(`MBL ${id} not found`);
      }
      return;
    }
    // Air: real HAWBs outlive their MAWB — detach (with history), then delete.
    await this.db.transaction(async (client) => {
      await detachHousesBeforeDelete(client, id, userId);
      try {
        await client.query('DELETE FROM mbl WHERE id = $1', [id]);
      } catch (err) {
        throw translateWriteError(err);
      }
    });
  }
}

function validateShippingTypeAndMethod(
  shippingType: MblShippingType,
  seaMethod: SeaMethod | undefined,
  airMethod: AirMethod | undefined,
): void {
  if (shippingType === MblShippingType.SEA && seaMethod === undefined) {
    throw new BadRequestException(
      'seaMethod is required when shippingType is "sea"',
    );
  }
  if (shippingType === MblShippingType.SEA && airMethod !== undefined) {
    throw new BadRequestException(
      'airMethod must not be set when shippingType is "sea"',
    );
  }
  if (shippingType === MblShippingType.AIR && seaMethod !== undefined) {
    throw new BadRequestException(
      'seaMethod must not be set when shippingType is "air"',
    );
  }
  if (shippingType === MblShippingType.AIR && airMethod === undefined) {
    throw new BadRequestException(
      'airMethod is required when shippingType is "air"',
    );
  }
}

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

function translateWriteError(err: unknown): unknown {
  const pgErr = err as { code?: unknown; constraint?: unknown } | null;
  if (
    pgErr?.code === PG_UNIQUE_VIOLATION &&
    pgErr.constraint === 'mbl_air_number_unique_idx'
  ) {
    return new BadRequestException('מספר ה-MAWB כבר קיים בתיק אחר');
  }
  if (pgErr?.code === PG_FOREIGN_KEY_VIOLATION) {
    return new BadRequestException(
      'לא ניתן לשמור/למחוק: קיימת הפניה לרשומה קשורה (לקוח, מסוף, שדה תעופה או הגעות שנרשמו)',
    );
  }
  return err;
}

function validateContainers(
  seaMethod: SeaMethod | undefined,
  containers: CreateMblContainerDto[] | undefined,
): void {
  if (seaMethod === SeaMethod.GROUPAGE_FCL) {
    if (!containers || containers.length === 0) {
      throw new BadRequestException(
        'At least one container is required when seaMethod is groupage_fcl',
      );
    }
  } else if (containers && containers.length > 0) {
    throw new BadRequestException(
      'containers is only applicable when seaMethod is groupage_fcl',
    );
  }
}

async function insertContainer(
  client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  mblId: number,
  container: CreateMblContainerDto,
): Promise<void> {
  await client.query(
    `INSERT INTO mbl_container
       (mbl_id, container_number, container_seal_number, cargo_description, gross_weight_kg, volume_cbm)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      mblId,
      container.containerNumber ?? null,
      container.containerSealNumber ?? null,
      container.cargoDescription ?? null,
      container.grossWeightKg ?? null,
      container.volumeCbm ?? null,
    ],
  );
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toNumberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function toMblContainerDto(row: MblContainerRow): MblContainerDto {
  return {
    id: row.id,
    containerNumber: row.container_number,
    containerSealNumber: row.container_seal_number,
    cargoDescription: row.cargo_description,
    grossWeightKg: toNumberOrNull(row.gross_weight_kg),
    volumeCbm: toNumberOrNull(row.volume_cbm),
  };
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}

function toFlightLegDto(row: FlightLegRow): FlightLegDto {
  return {
    legNo: row.leg_no,
    flightNumber: row.flight_number,
    fromAirport: row.from_airport,
    toAirport: row.to_airport,
    etd: toIsoOrNull(row.etd),
    eta: toIsoOrNull(row.eta),
    atd: toIsoOrNull(row.atd),
    ata: toIsoOrNull(row.ata),
  };
}

function toMblDto(
  row: MblRow,
  containers: MblContainerRow[],
  legs: FlightLegRow[] = [],
): MblDto {
  return {
    id: row.id,
    shippingType: row.shipping_type,
    seaMethod: row.sea_method,
    customerId: row.customer_id,
    customerName: row.customer_name,
    mblNumber: row.mbl_number,
    bookingNumber: row.booking_number,
    vesselName: row.vessel_name,
    voyageNumber: row.voyage_number,
    portOfLoading: row.port_of_loading,
    portOfDischarge: row.port_of_discharge,
    finalDestination: row.final_destination,
    shipperName: row.shipper_name,
    shipperAddress: row.shipper_address,
    consigneeName: row.consignee_name,
    consigneeAddress: row.consignee_address,
    notifyPartyName: row.notify_party_name,
    notifyPartyAddress: row.notify_party_address,
    containerNumber: row.container_number,
    containerSealNumber: row.container_seal_number,
    cargoDescription: row.cargo_description,
    grossWeightKg: toNumberOrNull(row.gross_weight_kg),
    volumeCbm: toNumberOrNull(row.volume_cbm),
    freightTerms: row.freight_terms,
    receiptDeliveryType: row.receipt_delivery_type,
    placeOfIssue: row.place_of_issue,
    dateOfIssue: row.date_of_issue,
    carrierName: row.carrier_name,
    status: row.status,
    handlerUserId: row.handler_user_id ?? null,
    handlerName: row.handler_name ?? null,
    ccfId: row.ccf_id ?? null,
    containers: containers.map(toMblContainerDto),
    airMethod: row.air_method ?? null,
    departureAirportCode: row.departure_airport_code ?? null,
    destinationAirportCode: row.destination_airport_code ?? null,
    cargoTerminalId: row.cargo_terminal_id ?? null,
    cargoTerminalName: row.cargo_terminal_name ?? null,
    cargoTerminalOther: row.cargo_terminal_other ?? null,
    pieces: row.pieces ?? null,
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
    shipmentStatus: row.shipment_status ?? null,
    shipmentStatusSource: row.shipment_status_source ?? null,
    flightLegs: legs.map(toFlightLegDto),
    mirrorHblId: row.mirror_hbl_id ?? null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toMblSummaryDto(row: MblSummaryRow): MblSummaryDto {
  return {
    id: row.id,
    shippingType: row.shipping_type,
    seaMethod: row.sea_method,
    airMethod: row.air_method ?? null,
    status: row.status,
    mblNumber: row.mbl_number,
    carrierName: row.carrier_name,
    handlerUserId: row.handler_user_id ?? null,
    handlerName: row.handler_name ?? null,
    hblCount: Number(row.hbl_count),
    orderCount: Number(row.order_count),
    orderIds: row.order_ids ?? [],
    customerNames: row.customer_names ?? [],
    createdAt: toIsoString(row.created_at),
  };
}
