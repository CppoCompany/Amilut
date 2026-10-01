import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PaymentTerms } from '../orders/orders.enums';
import { CreateMblDto } from './dto/create-mbl.dto';
import { CreateMblContainerDto, MblContainerDto } from './dto/mbl-container.dto';
import { MblDto } from './dto/mbl.dto';
import { UpdateMblDto } from './dto/update-mbl.dto';
import { MblShippingType, SeaMethod } from './mbl.enums';
import { assertCustomerExists } from './mbl-validation.util';

type WritableMblField = Exclude<keyof CreateMblDto, 'shippingType' | 'seaMethod' | 'containers'>;

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
  created_at: Date | string;
  updated_at: Date | string;
}

interface MblContainerRow {
  id: number;
  container_number: string | null;
  container_seal_number: string | null;
  cargo_description: string | null;
  gross_weight_kg: string | null;
  volume_cbm: string | null;
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
         m.created_at,
         m.updated_at
    FROM mbl m
    LEFT JOIN customers c ON c.id = m.customer_id`;

const CONTAINER_SELECT = `
  SELECT id, container_number, container_seal_number, cargo_description, gross_weight_kg, volume_cbm
    FROM mbl_container
   WHERE mbl_id = $1
   ORDER BY id`;

@Injectable()
export class MblService {
  constructor(private readonly db: DatabaseService) {}

  /** Opens a new MBL. `seaMethod` is required iff `shippingType = 'sea'`;
   *  `containers` is required iff `seaMethod = 'groupage_fcl'` (the only
   *  method with a multi-container table — the other three sea methods keep
   *  their single container directly on `mbl`, see `WRITABLE_COLUMNS`). */
  async create(dto: CreateMblDto): Promise<MblDto> {
    validateShippingTypeAndMethod(dto.shippingType, dto.seaMethod);
    validateContainers(dto.seaMethod, dto.containers);
    if (dto.customerId !== undefined) {
      await assertCustomerExists(this.db, dto.customerId);
    }

    const newId = await this.db.transaction(async (client) => {
      const keys = WRITABLE_KEYS.filter((key) => dto[key] !== undefined);
      const columns = [
        'shipping_type',
        ...(dto.seaMethod !== undefined ? ['sea_method'] : []),
        ...keys.map((key) => WRITABLE_COLUMNS[key]),
      ];
      const values: unknown[] = [
        dto.shippingType,
        ...(dto.seaMethod !== undefined ? [dto.seaMethod] : []),
        ...keys.map((key) => dto[key]),
      ];
      const placeholders = values.map((_, i) => `$${i + 1}`);

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO mbl (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
        values,
      );
      const mblId = inserted.rows[0].id;

      if (dto.containers?.length) {
        for (const container of dto.containers) {
          await insertContainer(client, mblId, container);
        }
      }

      return mblId;
    });

    return this.findById(newId);
  }

  async findById(id: number): Promise<MblDto> {
    const row = await this.db.queryOne<MblRow>(`${MBL_SELECT} WHERE m.id = $1`, [id]);
    if (!row) {
      throw new NotFoundException(`MBL ${id} not found`);
    }
    const containers =
      row.sea_method === SeaMethod.GROUPAGE_FCL
        ? await this.db.query<MblContainerRow>(CONTAINER_SELECT, [id])
        : [];
    return toMblDto(row, containers);
  }

  /** Patches the provided fields. `containers` (when provided) REPLACES the
   *  full set, same semantics as `PATCH /shipments/:id/orders`. */
  async update(id: number, dto: UpdateMblDto): Promise<MblDto> {
    if (dto.customerId !== undefined) {
      await assertCustomerExists(this.db, dto.customerId);
    }

    await this.db.transaction(async (client) => {
      const existing = await client.query<{ id: number; sea_method: SeaMethod | null }>(
        'SELECT id, sea_method FROM mbl WHERE id = $1',
        [id],
      );
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
        await client.query(`UPDATE mbl SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      }

      if (dto.containers !== undefined) {
        validateContainers(seaMethod ?? undefined, dto.containers);
        await client.query('DELETE FROM mbl_container WHERE mbl_id = $1', [id]);
        for (const container of dto.containers) {
          await insertContainer(client, id, container);
        }
      }
    });

    return this.findById(id);
  }

  /** Hard delete — cascades to its containers and HBLs (`ON DELETE CASCADE`),
   *  which in turn frees any of their orders back to unassigned automatically
   *  (`orders.hbl_id ON DELETE SET NULL`). */
  async remove(id: number): Promise<void> {
    const row = await this.db.queryOne<{ id: number }>('DELETE FROM mbl WHERE id = $1 RETURNING id', [
      id,
    ]);
    if (!row) {
      throw new NotFoundException(`MBL ${id} not found`);
    }
  }
}

function validateShippingTypeAndMethod(
  shippingType: MblShippingType,
  seaMethod: SeaMethod | undefined,
): void {
  if (shippingType === MblShippingType.SEA && seaMethod === undefined) {
    throw new BadRequestException('seaMethod is required when shippingType is "sea"');
  }
  if (shippingType === MblShippingType.AIR && seaMethod !== undefined) {
    throw new BadRequestException('seaMethod must not be set when shippingType is "air"');
  }
}

function validateContainers(
  seaMethod: SeaMethod | undefined,
  containers: CreateMblContainerDto[] | undefined,
): void {
  if (seaMethod === SeaMethod.GROUPAGE_FCL) {
    if (!containers || containers.length === 0) {
      throw new BadRequestException('At least one container is required when seaMethod is groupage_fcl');
    }
  } else if (containers && containers.length > 0) {
    throw new BadRequestException('containers is only applicable when seaMethod is groupage_fcl');
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

function toMblDto(row: MblRow, containers: MblContainerRow[]): MblDto {
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
    containers: containers.map(toMblContainerDto),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}
