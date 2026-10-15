import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { insertNotification } from '../notifications/notifications.util';
import { CcfStatus } from './ccf.enums';
import { CcfDto } from './dto/ccf.dto';
import { CreateCcfDto } from './dto/create-ccf.dto';
import { ListCcfQuery } from './dto/list-ccf.query';
import { NextCcfFileNumberDto } from './dto/next-ccf-file-number.dto';

interface CcfRow {
  id: number;
  file_number: string;
  shipment_file_id: number | null;
  shipment_file_mbl_number: string | null;
  status: CcfStatus;
  created_by: number;
  created_by_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const CCF_SELECT = `
  SELECT c.id,
         c.file_number,
         c.shipment_file_id,
         m.mbl_number AS shipment_file_mbl_number,
         c.status,
         c.created_by,
         u.name AS created_by_name,
         c.created_at,
         c.updated_at
    FROM customs_clearance_files c
    LEFT JOIN mbl m ON m.id = c.shipment_file_id
    LEFT JOIN users u ON u.id = c.created_by`;

@Injectable()
export class CcfService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Opens a Customs Clearance File, optionally linked to an existing
   * shipping case (`shipmentFileId` → `mbl.id`). The file number is always
   * server-generated from `customs_clearance_files_file_number_seq`
   * (`nextval()` is atomic, so concurrent creates never race for a number);
   * the DB's `UNIQUE(shipment_file_id)` constraint is the authoritative
   * concurrency guard against double-linking the same shipping case — the
   * pre-check below only exists to turn the common case (a missing/bad id)
   * into a friendlier 404 before any write is attempted.
   *
   * The notification insert runs inside the same transaction as the CCF
   * insert (see `insertNotification`), so the two always commit or roll
   * back together — a CCF never exists without its notification having at
   * least been attempted in the same atomic unit.
   */
  async create(dto: CreateCcfDto, userId: number): Promise<CcfDto> {
    let shipmentFile: { id: number; handler_user_id: number | null } | null =
      null;
    if (dto.shipmentFileId !== undefined) {
      shipmentFile = await this.db.queryOne<{
        id: number;
        handler_user_id: number | null;
      }>('SELECT id, handler_user_id FROM mbl WHERE id = $1', [
        dto.shipmentFileId,
      ]);
      if (!shipmentFile) {
        throw new NotFoundException(
          `Shipment file ${dto.shipmentFileId} not found`,
        );
      }
    }

    // Who gets notified: the linked shipping case's handler (whoever opened
    // it), falling back to the CCF's own creator when there's no linked
    // case, or that case has no handler on record. There is no broker-role
    // model in this app yet (see NotificationsModule's doc comment) — this
    // is the closest available stand-in, not a permanent design.
    const recipientUserId = shipmentFile?.handler_user_id ?? userId;

    const newId = await this.db.transaction(async (client) => {
      let inserted;
      try {
        inserted = await client.query<{ id: number }>(
          `INSERT INTO customs_clearance_files (file_number, shipment_file_id, status, created_by)
           VALUES ('CCF' || nextval('customs_clearance_files_file_number_seq'), $1, $2, $3)
           RETURNING id`,
          [dto.shipmentFileId ?? null, CcfStatus.OPEN, userId],
        );
      } catch (err) {
        throw translateWriteError(err);
      }
      const ccfId = inserted.rows[0].id;

      await insertNotification(client, {
        recipientUserId,
        message: shipmentFile
          ? `נפתח תיק סליקת מכס חדש, מקושר לתיק שילוח ${shipmentFile.id}`
          : 'נפתח תיק סליקת מכס עצמאי חדש',
        relatedCcfId: ccfId,
        actorUserId: userId,
      });

      return ccfId;
    });

    return this.findById(newId);
  }

  /**
   * Peeks at `customs_clearance_files_file_number_seq` without advancing it,
   * so the "new CCF" screen can show the number before anything is saved.
   * Reading the sequence relation directly (rather than `nextval()`) means
   * an abandoned form never burns a number; the trade-off is that a
   * concurrent create can take this number first, in which case `create`
   * simply assigns the next one.
   */
  async peekNextFileNumber(): Promise<NextCcfFileNumberDto> {
    const row = await this.db.queryOne<{ next_value: string }>(
      `SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END AS next_value
         FROM customs_clearance_files_file_number_seq`,
    );
    return { fileNumber: `CCF${row!.next_value}` };
  }

  async findById(id: number): Promise<CcfDto> {
    const row = await this.db.queryOne<CcfRow>(
      `${CCF_SELECT} WHERE c.id = $1`,
      [id],
    );
    if (!row) {
      throw new NotFoundException(`Customs clearance file ${id} not found`);
    }
    return toCcfDto(row);
  }

  /** Batch list for the Order/CCF picker (Import Paperwork Filing's direct-access flow). */
  async findAll(query: ListCcfQuery): Promise<CcfDto[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.status !== undefined) {
      params.push(query.status);
      where.push(`c.status = $${params.length}`);
    }
    if (query.shipmentFileId !== undefined) {
      params.push(query.shipmentFileId);
      where.push(`c.shipment_file_id = $${params.length}`);
    }
    params.push(query.limit ?? 200);
    const limitIdx = params.length;

    const rows = await this.db.query<CcfRow>(
      `${CCF_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.id DESC LIMIT $${limitIdx}`,
      params,
    );
    return rows.map(toCcfDto);
  }
}

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

function translateWriteError(err: unknown): unknown {
  const pgErr = err as { code?: unknown; constraint?: unknown } | null;
  if (pgErr?.code === PG_UNIQUE_VIOLATION) {
    if (pgErr.constraint === 'customs_clearance_files_shipment_file_id_key') {
      return new BadRequestException('לתיק השילוח הזה כבר יש תיק סליקת מכס');
    }
    return new BadRequestException('מספר תיק הסליקה כבר קיים, נסו שוב');
  }
  if (pgErr?.code === PG_FOREIGN_KEY_VIOLATION) {
    return new BadRequestException('תיק השילוח שנבחר לא נמצא');
  }
  return err;
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toCcfDto(row: CcfRow): CcfDto {
  return {
    id: row.id,
    fileNumber: row.file_number,
    shipmentFileId: row.shipment_file_id,
    shipmentFileMblNumber: row.shipment_file_mbl_number,
    status: row.status,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}
