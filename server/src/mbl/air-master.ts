import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AirMethod } from '../air/air.enums';
import {
  DocumentStatus,
  ShipmentStatus,
  StatusTrack,
  statusRank,
} from '../status-tracks/status-tracks.enums';
import {
  initTrackIn,
  StatusTracksService,
} from '../status-tracks/status-tracks.service';
import { CreateFlightLegDto } from './dto/flight-leg.dto';
import { UpdateMblDto } from './dto/update-mbl.dto';
import { MblShippingType } from './mbl.enums';

/** MAWB-only fields (rejected on a sea MBL). */
const AIR_ONLY_FIELDS = [
  'departureAirportCode',
  'destinationAirportCode',
  'cargoTerminalId',
  'cargoTerminalOther',
  'pieces',
  'approvedChargeableWeightKg',
  'chargeableWeightOverrideReason',
  'specialHandlingCodes',
  'flightLegs',
] as const;

/** Sea-document fields that have no meaning on a MAWB. */
const SEA_ONLY_FIELDS = [
  'vesselName',
  'voyageNumber',
  'portOfLoading',
  'portOfDischarge',
  'finalDestination',
  'containerNumber',
  'containerSealNumber',
  'receiptDeliveryType',
  'containers',
] as const;

/** Rejects fields that belong to the other shipping mode, so a sea MBL can
 *  never pick up air data (and vice versa). */
export function assertFieldsMatchMode(
  shippingType: MblShippingType,
  dto: UpdateMblDto,
): void {
  const foreign =
    shippingType === MblShippingType.SEA ? AIR_ONLY_FIELDS : SEA_ONLY_FIELDS;
  const present = foreign.filter((key) => dto[key] !== undefined);
  if (present.length > 0) {
    throw new BadRequestException(
      `${present.join(', ')} not applicable when shippingType is "${shippingType}"`,
    );
  }
}

/** A Direct MAWB's importer lives on the master (and its mirror house). */
export function assertDirectHasCustomer(
  airMethod: AirMethod | null,
  customerId: number | null | undefined,
): void {
  if (airMethod === AirMethod.DIRECT && customerId == null) {
    throw new BadRequestException('במשלוח ישיר יש לבחור לקוח (היבואן) ל-MAWB');
  }
}

/** Replaces all legs; `leg_no` follows the array order. */
export async function replaceFlightLegs(
  client: PoolClient,
  mblId: number,
  legs: CreateFlightLegDto[],
): Promise<void> {
  await client.query('DELETE FROM mbl_flight_leg WHERE mbl_id = $1', [mblId]);
  for (const [index, leg] of legs.entries()) {
    await client.query(
      `INSERT INTO mbl_flight_leg (mbl_id, leg_no, flight_number, from_airport, to_airport, etd, eta, atd, ata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        mblId,
        index + 1,
        leg.flightNumber?.trim() || null,
        leg.fromAirport ?? null,
        leg.toAirport ?? null,
        leg.etd ?? null,
        leg.eta ?? null,
        leg.atd ?? null,
        leg.ata ?? null,
      ],
    );
  }
}

/** The status the legs prove: the last leg's ATA → arrived; the first leg's ATD → departed. */
export function statusFromLegs(
  legs: readonly { atd: unknown; ata: unknown }[],
): ShipmentStatus | null {
  if (legs.length === 0) return null;
  if (legs[legs.length - 1].ata) return ShipmentStatus.ARRIVED;
  if (legs[0].atd) return ShipmentStatus.DEPARTED;
  return null;
}

/**
 * Moves the MAWB shipment status forward when the legs record a reliable
 * event, and — when a leg correction withdraws the event behind an
 * automatic status — steps it back to what the legs still prove (or to the
 * value a user last set by hand). A status a user set by hand is never
 * lowered automatically.
 */
export async function syncShipmentStatusFromLegs(
  client: PoolClient,
  tracks: StatusTracksService,
  mblId: number,
  userId: number,
): Promise<void> {
  const legs = (
    await client.query<{ atd: Date | null; ata: Date | null }>(
      'SELECT atd, ata FROM mbl_flight_leg WHERE mbl_id = $1 ORDER BY leg_no',
      [mblId],
    )
  ).rows;
  const current = (
    await client.query<{
      shipment_status: ShipmentStatus | null;
      shipment_status_source: 'manual' | 'auto' | null;
    }>(
      'SELECT shipment_status, shipment_status_source FROM mbl WHERE id = $1',
      [mblId],
    )
  ).rows[0];
  const proven = statusFromLegs(legs);

  if (proven && statusRank(proven) > statusRank(current.shipment_status)) {
    await tracks.changeAutomaticallyIn(client, {
      track: StatusTrack.SHIPMENT,
      entityId: mblId,
      to: proven,
      reason:
        proven === ShipmentStatus.ARRIVED
          ? 'נרשם ATA לקטע הטיסה האחרון'
          : 'נרשם ATD לקטע הטיסה הראשון',
      userId,
    });
    return;
  }

  if (
    current.shipment_status_source === 'auto' &&
    statusRank(proven) < statusRank(current.shipment_status)
  ) {
    const lastManual = await tracks.lastManualValueIn(
      client,
      StatusTrack.SHIPMENT,
      mblId,
    );
    const restoreManual =
      lastManual !== null &&
      statusRank(lastManual) > statusRank(proven) &&
      statusRank(lastManual) < statusRank(current.shipment_status);
    await tracks.changeAutomaticallyIn(client, {
      track: StatusTrack.SHIPMENT,
      entityId: mblId,
      to: restoreManual ? lastManual : proven,
      markAs: restoreManual ? 'manual' : 'auto',
      reason: 'נתוני קטעי הטיסה תוקנו — הסטטוס האוטומטי עודכן',
      userId,
    });
  }
}

/** Columns a Direct MAWB copies onto its mirror house. */
const MIRRORED_COLUMNS = [
  'customer_id',
  'shipper_name',
  'shipper_address',
  'consignee_name',
  'consignee_address',
  'notify_party_name',
  'notify_party_address',
  'cargo_description',
  'gross_weight_kg',
  'volume_cbm',
  'pieces',
  'special_handling_codes',
  'calculated_chargeable_weight_kg',
  'approved_chargeable_weight_kg',
  'volumetric_divisor',
  'weight_rounding_step_kg',
  'weight_rounding_mode',
  'chargeable_weight_overridden',
  'chargeable_weight_override_by',
  'chargeable_weight_override_at',
];

/**
 * Creates (first call) or refreshes the hidden mirror house of a Direct MAWB.
 * It never carries an HAWB number and is excluded from every HAWB list —
 * it only exists so orders, the CCF and arrivals keep hanging off a house.
 */
export async function upsertMirrorHouse(
  client: PoolClient,
  mblId: number,
  userId: number,
): Promise<void> {
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM hbl WHERE mbl_id = $1 AND is_master_mirror',
    [mblId],
  );
  const columns = MIRRORED_COLUMNS.join(', ');
  if (existing.rows.length === 0) {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO hbl (mbl_id, sequence_number, shipping_type, is_master_mirror, handler_user_id, ${columns})
       SELECT id, 1, 'air', true, $2, ${columns} FROM mbl WHERE id = $1
       RETURNING id`,
      [mblId, userId],
    );
    const mirrorId = inserted.rows[0].id;
    await client.query(
      `UPDATE hbl SET ibl_number = 'IB-' || lpad(id::text, 3, '0') WHERE id = $1`,
      [mirrorId],
    );
    await initTrackIn(
      client,
      StatusTrack.DOCUMENT,
      mirrorId,
      DocumentStatus.PENDING,
      userId,
    );
    return;
  }
  const sets = MIRRORED_COLUMNS.map((column) => `${column} = m.${column}`);
  await client.query(
    `UPDATE hbl h SET ${sets.join(', ')}, updated_at = now()
       FROM mbl m
      WHERE m.id = $1 AND h.id = $2`,
    [mblId, existing.rows[0].id],
  );
}

/**
 * Before an air MAWB is deleted its real HAWBs are detached (they exist on
 * their own and keep their orders / CCF), each detach recorded in the link
 * history. Refused once any of its houses has a recorded arrival.
 */
export async function detachHousesBeforeDelete(
  client: PoolClient,
  mblId: number,
  userId: number,
): Promise<void> {
  const arrivals = await client.query(
    `SELECT 1 FROM hbl_arrival a JOIN hbl h ON h.id = a.hbl_id
      WHERE h.mbl_id = $1 AND a.voided_at IS NULL LIMIT 1`,
    [mblId],
  );
  if (arrivals.rows.length > 0) {
    throw new BadRequestException(
      'לא ניתן למחוק MAWB שכבר נרשמו הגעות למשלוחים שלו',
    );
  }
  const houses = await client.query<{ id: number }>(
    'SELECT id FROM hbl WHERE mbl_id = $1 AND NOT is_master_mirror',
    [mblId],
  );
  for (const house of houses.rows) {
    await client.query(
      'UPDATE hbl SET mbl_id = NULL, sequence_number = NULL, updated_at = now() WHERE id = $1',
      [house.id],
    );
    await client.query(
      `INSERT INTO hbl_master_link_history (hbl_id, previous_mbl_id, new_mbl_id, reason, changed_by)
       VALUES ($1, $2, NULL, $3, $4)`,
      [house.id, mblId, 'ה-MAWB נמחק', userId],
    );
  }
}
