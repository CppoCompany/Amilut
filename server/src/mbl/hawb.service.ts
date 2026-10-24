import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import {
  DocumentStatus,
  StatusEntityType,
  StatusTrack,
} from '../status-tracks/status-tracks.enums';
import {
  insertAuditLog,
  StatusTracksService,
} from '../status-tracks/status-tracks.service';
import {
  CreateHblArrivalDto,
  HblArrivalDto,
  HblLinkHistoryEntryDto,
} from './dto/hawb-operations.dto';
import { HblDto } from './dto/hbl.dto';
import {
  assertAirMasterAcceptsHouse,
  HblService,
  MasterRow,
  nextSequenceNumber,
} from './hbl.service';
import { MblShippingType } from './mbl.enums';

interface HouseRow {
  id: number;
  mbl_id: number | null;
  shipping_type: MblShippingType;
  is_master_mirror: boolean;
  pieces: number | null;
  received: string;
}

/**
 * Air-only HAWB operations: linking to / moving between MAWBs, arrival events
 * and the document status track. Every exceptional action (relink after
 * arrival, over-receipt, voiding an arrival, backwards status) requires a
 * reason and leaves an append-only audit row.
 */
@Injectable()
export class HawbService {
  constructor(
    private readonly db: DatabaseService,
    private readonly hbl: HblService,
    private readonly tracks: StatusTracksService,
  ) {}

  /**
   * Links the HAWB to `mblId`, moves it there from another MAWB, or detaches
   * it (`null`). Free before the first arrival; afterwards it is a correction
   * that needs a reason. The house's chargeable weight is recalculated with
   * the new airline's rule.
   */
  async linkToMaster(
    id: number,
    mblId: number | null,
    reason: string | undefined,
    userId: number,
  ): Promise<HblDto> {
    await this.db.transaction(async (client) => {
      const house = await lockAirHouse(client, id);
      if (house.is_master_mirror) {
        throw new BadRequestException(
          'ה-House הפנימי של משלוח ישיר אינו ניתן לשיוך מחדש',
        );
      }
      if (house.mbl_id === mblId) {
        throw new BadRequestException('ה-HAWB כבר משויך ל-MAWB הזה');
      }
      const hasArrivals = Number(house.received) > 0;
      const trimmedReason = reason?.trim() || null;
      if (hasArrivals && !trimmedReason) {
        throw new BadRequestException(
          'כבר נרשמו הגעות ל-HAWB — שינוי שיוך הוא תיקון ומחייב סיבה',
        );
      }

      let master: MasterRow | null = null;
      if (mblId !== null) {
        master =
          (
            await client.query<MasterRow>(
              'SELECT id, shipping_type, sea_method, air_method, customer_id, mbl_number FROM mbl WHERE id = $1',
              [mblId],
            )
          ).rows[0] ?? null;
        if (!master) {
          throw new NotFoundException(`MBL ${mblId} not found`);
        }
        await assertAirMasterAcceptsHouse(
          (sql, params) =>
            client
              .query<Record<string, unknown>>(sql, params)
              .then((r) => r.rows),
          master,
          id,
        );
      }

      const sequenceNumber = master
        ? await nextSequenceNumber(client, master.id)
        : null;
      await client.query(
        'UPDATE hbl SET mbl_id = $1, sequence_number = $2, updated_at = now() WHERE id = $3',
        [mblId, sequenceNumber, id],
      );
      await client.query(
        `INSERT INTO hbl_master_link_history (hbl_id, previous_mbl_id, new_mbl_id, is_correction, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, house.mbl_id, mblId, hasArrivals, trimmedReason, userId],
      );
      await this.hbl.writeHouseWeight(client, id, master?.mbl_number ?? null, {
        approved: undefined,
        implicit: true,
        userId,
      });
    });
    return this.hbl.findById(id);
  }

  async listLinkHistory(id: number): Promise<HblLinkHistoryEntryDto[]> {
    const rows = await this.db.query<{
      id: string;
      previous_mbl_id: number | null;
      previous_mbl_number: string | null;
      new_mbl_id: number | null;
      new_mbl_number: string | null;
      is_correction: boolean;
      reason: string | null;
      changed_by_name: string | null;
      changed_at: Date;
    }>(
      `SELECT l.id, l.previous_mbl_id, pm.mbl_number AS previous_mbl_number,
              l.new_mbl_id, nm.mbl_number AS new_mbl_number,
              l.is_correction, l.reason, u.name AS changed_by_name, l.changed_at
         FROM hbl_master_link_history l
         LEFT JOIN mbl   pm ON pm.id = l.previous_mbl_id
         LEFT JOIN mbl   nm ON nm.id = l.new_mbl_id
         LEFT JOIN users u  ON u.id = l.changed_by
        WHERE l.hbl_id = $1
        ORDER BY l.changed_at DESC, l.id DESC`,
      [id],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      previousMblId: row.previous_mbl_id,
      previousMblNumber: row.previous_mbl_number,
      newMblId: row.new_mbl_id,
      newMblNumber: row.new_mbl_number,
      isCorrection: row.is_correction,
      reason: row.reason,
      changedByName: row.changed_by_name,
      changedAt: new Date(row.changed_at).toISOString(),
    }));
  }

  async listArrivals(id: number): Promise<HblArrivalDto[]> {
    const rows = await this.db.query<{
      id: number;
      flight_number: string;
      arrival_date: string;
      pieces_received: number;
      notes: string | null;
      is_override: boolean;
      override_reason: string | null;
      created_by_name: string | null;
      created_at: Date;
      voided_at: Date | null;
      voided_by_name: string | null;
      void_reason: string | null;
    }>(
      `SELECT a.id, a.flight_number, to_char(a.arrival_date, 'YYYY-MM-DD') AS arrival_date,
              a.pieces_received, a.notes, a.is_override, a.override_reason,
              cu.name AS created_by_name, a.created_at,
              a.voided_at, vu.name AS voided_by_name, a.void_reason
         FROM hbl_arrival a
         LEFT JOIN users cu ON cu.id = a.created_by
         LEFT JOIN users vu ON vu.id = a.voided_by
        WHERE a.hbl_id = $1
        ORDER BY a.arrival_date, a.id`,
      [id],
    );
    return rows.map((row) => ({
      id: row.id,
      flightNumber: row.flight_number,
      arrivalDate: row.arrival_date,
      piecesReceived: row.pieces_received,
      notes: row.notes,
      isOverride: row.is_override,
      overrideReason: row.override_reason,
      createdByName: row.created_by_name,
      createdAt: new Date(row.created_at).toISOString(),
      voidedAt: row.voided_at ? new Date(row.voided_at).toISOString() : null,
      voidedByName: row.voided_by_name,
      voidReason: row.void_reason,
    }));
  }

  /**
   * Records pieces received on one flight. The HAWB must be on a MAWB and
   * have an expected piece count. Going above the expected total is refused
   * unless the caller explicitly overrides with a reason (audited).
   */
  async addArrival(
    id: number,
    dto: CreateHblArrivalDto,
    userId: number,
  ): Promise<HblDto> {
    await this.db.transaction(async (client) => {
      const house = await lockAirHouse(client, id);
      if (house.mbl_id === null) {
        throw new BadRequestException(
          'יש לשייך את ה-HAWB ל-MAWB לפני רישום הגעה',
        );
      }
      if (house.pieces === null) {
        throw new BadRequestException(
          'יש להזין מספר חלקים צפוי ב-HAWB לפני רישום הגעה',
        );
      }
      const total = Number(house.received) + dto.piecesReceived;
      const exceeds = total > house.pieces;
      const overrideReason = dto.overrideReason?.trim() || null;
      if (exceeds && !(dto.override && overrideReason)) {
        throw new BadRequestException(
          `סך החלקים שהתקבלו (${total}) עולה על המספר הצפוי (${house.pieces}) — נדרש אישור חריגה עם סיבה`,
        );
      }
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO hbl_arrival (hbl_id, flight_number, arrival_date, pieces_received, notes, is_override, override_reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          id,
          dto.flightNumber.trim(),
          dto.arrivalDate,
          dto.piecesReceived,
          dto.notes?.trim() || null,
          exceeds,
          exceeds ? overrideReason : null,
          userId,
        ],
      );
      if (exceeds) {
        await insertAuditLog(client, {
          entityType: StatusEntityType.HBL,
          entityId: id,
          action: 'arrival_over_receipt_override',
          before: { expected: house.pieces, received: Number(house.received) },
          after: {
            arrivalId: inserted.rows[0].id,
            received: total,
            flightNumber: dto.flightNumber.trim(),
          },
          reason: overrideReason,
          userId,
        });
      }
    });
    return this.hbl.findById(id);
  }

  /** Voids a wrong arrival row (it stops counting, but stays on record). */
  async voidArrival(
    id: number,
    arrivalId: number,
    reason: string,
    userId: number,
  ): Promise<HblDto> {
    await this.db.transaction(async (client) => {
      await lockAirHouse(client, id);
      const arrival = (
        await client.query<{
          pieces_received: number;
          flight_number: string;
          voided_at: Date | null;
        }>(
          'SELECT pieces_received, flight_number, voided_at FROM hbl_arrival WHERE id = $1 AND hbl_id = $2',
          [arrivalId, id],
        )
      ).rows[0];
      if (!arrival) {
        throw new NotFoundException(`Arrival ${arrivalId} not found`);
      }
      if (arrival.voided_at) {
        throw new BadRequestException('רישום ההגעה כבר בוטל');
      }
      await client.query(
        'UPDATE hbl_arrival SET voided_at = now(), voided_by = $1, void_reason = $2 WHERE id = $3',
        [userId, reason.trim(), arrivalId],
      );
      await insertAuditLog(client, {
        entityType: StatusEntityType.HBL,
        entityId: id,
        action: 'arrival_voided',
        before: {
          arrivalId,
          piecesReceived: arrival.pieces_received,
          flightNumber: arrival.flight_number,
        },
        reason: reason.trim(),
        userId,
      });
    });
    return this.hbl.findById(id);
  }

  async changeDocumentStatus(
    id: number,
    status: DocumentStatus,
    reason: string | undefined,
    userId: number,
  ): Promise<HblDto> {
    await this.tracks.changeManually({
      track: StatusTrack.DOCUMENT,
      entityId: id,
      to: status,
      reason,
      userId,
    });
    return this.hbl.findById(id);
  }
}

/** Locks an air house row and returns what the operations above need. */
async function lockAirHouse(client: PoolClient, id: number): Promise<HouseRow> {
  const house = (
    await client.query<HouseRow>(
      `SELECT h.id, h.mbl_id, h.shipping_type, h.is_master_mirror, h.pieces,
              (SELECT COALESCE(sum(a.pieces_received), 0) FROM hbl_arrival a
                WHERE a.hbl_id = h.id AND a.voided_at IS NULL) AS received
         FROM hbl h WHERE h.id = $1 FOR UPDATE OF h`,
      [id],
    )
  ).rows[0];
  if (!house) {
    throw new NotFoundException(`HBL ${id} not found`);
  }
  if (house.shipping_type !== MblShippingType.AIR) {
    throw new BadRequestException('הפעולה נתמכת רק ב-HAWB של משלוח אווירי');
  }
  return house;
}
