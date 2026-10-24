import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { StatusHistoryEntryDto } from './dto/status-history.dto';
import {
  StatusChangeSource,
  StatusEntityType,
  StatusTrack,
  statusRank,
} from './status-tracks.enums';

/** Where each track lives. `scope` keeps the tracks air-only for now, so a
 *  sea row can never be given one by accident. */
interface TrackConfig {
  track: StatusTrack;
  entityType: StatusEntityType;
  table: string;
  column: string;
  /** `mbl.shipment_status_source` — only the shipment track has one. */
  sourceColumn?: string;
  scope: string;
  scopeError: string;
}

const TRACKS: Record<StatusTrack, TrackConfig> = {
  [StatusTrack.SHIPMENT]: {
    track: StatusTrack.SHIPMENT,
    entityType: StatusEntityType.MBL,
    table: 'mbl',
    column: 'shipment_status',
    sourceColumn: 'shipment_status_source',
    scope: "shipping_type = 'air'",
    scopeError: 'סטטוס משלוח נתמך כרגע רק ב-MAWB אווירי',
  },
  [StatusTrack.DOCUMENT]: {
    track: StatusTrack.DOCUMENT,
    entityType: StatusEntityType.HBL,
    table: 'hbl',
    column: 'document_status',
    scope: "shipping_type = 'air'",
    scopeError: 'סטטוס מסמכים נתמך כרגע רק ב-HAWB אווירי',
  },
  [StatusTrack.CLEARANCE]: {
    track: StatusTrack.CLEARANCE,
    entityType: StatusEntityType.CCF,
    table: 'customs_clearance_files',
    column: 'clearance_status',
    scope: 'hbl_id IS NOT NULL',
    scopeError: 'סטטוס סליקה נתמך כרגע רק בתיק סליקה של HAWB אווירי',
  },
};

export interface StatusChange {
  track: StatusTrack;
  entityId: number;
  to: string;
  reason?: string | null;
  userId: number;
}

export interface AuditEntry {
  entityType: StatusEntityType;
  entityId: number;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  userId: number;
}

/**
 * The shared status-track architecture: every change of a track writes the
 * new value and a `status_history` row in the same transaction. Users may
 * move a track backwards (a correction) only with a reason. The history
 * tables are append-only at the database level (migration 027).
 */
@Injectable()
export class StatusTracksService {
  constructor(private readonly db: DatabaseService) {}

  /** A user sets a track. Forward/sideways = manual; backwards = correction (reason required). */
  async changeManually(change: StatusChange): Promise<void> {
    await this.db.transaction((client) =>
      this.changeManuallyIn(client, change),
    );
  }

  async changeManuallyIn(
    client: PoolClient,
    change: StatusChange,
  ): Promise<void> {
    const config = TRACKS[change.track];
    const current = await readCurrent(client, config, change.entityId);
    if (current === change.to) return;

    const isCorrection = statusRank(change.to) < statusRank(current);
    const reason = change.reason?.trim() || null;
    if (isCorrection && !reason) {
      throw new BadRequestException(
        'החזרת סטטוס לאחור היא תיקון — יש לציין סיבה',
      );
    }
    await writeStatus(client, config, change.entityId, change.to, 'manual');
    await insertStatusHistory(client, {
      config,
      entityId: change.entityId,
      from: current,
      to: change.to,
      source: isCorrection
        ? StatusChangeSource.CORRECTION
        : StatusChangeSource.MANUAL,
      reason,
      userId: change.userId,
    });
  }

  /** The server sets a track from a reliable event (e.g. a flight leg's ATD). */
  async changeAutomaticallyIn(
    client: PoolClient,
    change: Omit<StatusChange, 'to'> & {
      to: string | null;
      /** Stored source of the new value — `manual` when the server restores a
       *  value a user had set. The history row is always `auto`. */
      markAs?: 'manual' | 'auto';
    },
  ): Promise<void> {
    const config = TRACKS[change.track];
    const current = await readCurrent(client, config, change.entityId);
    if (current === change.to) return;
    await writeStatus(
      client,
      config,
      change.entityId,
      change.to,
      change.to === null ? null : (change.markAs ?? 'auto'),
    );
    await insertStatusHistory(client, {
      config,
      entityId: change.entityId,
      from: current,
      to: change.to,
      source: StatusChangeSource.AUTO,
      reason: change.reason ?? null,
      userId: change.userId,
    });
  }

  /** The value a user last set by hand on a track (used when an automatic
   *  status is withdrawn because the event behind it was corrected). */
  async lastManualValueIn(
    client: PoolClient,
    track: StatusTrack,
    entityId: number,
  ): Promise<string | null> {
    const config = TRACKS[track];
    const result = await client.query<{ to_value: string | null }>(
      `SELECT to_value FROM status_history
        WHERE entity_type = $1 AND entity_id = $2 AND track = $3 AND source <> 'auto'
        ORDER BY changed_at DESC, id DESC
        LIMIT 1`,
      [config.entityType, entityId, track],
    );
    return result.rows[0]?.to_value ?? null;
  }

  async listHistory(
    entityType: StatusEntityType,
    entityId: number,
  ): Promise<StatusHistoryEntryDto[]> {
    const rows = await this.db.query<{
      id: string;
      track: StatusTrack;
      from_value: string | null;
      to_value: string | null;
      source: StatusChangeSource;
      reason: string | null;
      changed_by: number | null;
      changed_by_name: string | null;
      changed_at: Date | string;
    }>(
      `SELECT s.id, s.track, s.from_value, s.to_value, s.source, s.reason,
              s.changed_by, u.name AS changed_by_name, s.changed_at
         FROM status_history s
         LEFT JOIN users u ON u.id = s.changed_by
        WHERE s.entity_type = $1 AND s.entity_id = $2
        ORDER BY s.changed_at DESC, s.id DESC`,
      [entityType, entityId],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      track: row.track,
      fromValue: row.from_value,
      toValue: row.to_value,
      source: row.source,
      reason: row.reason,
      changedBy: row.changed_by,
      changedByName: row.changed_by_name,
      changedAt: (row.changed_at instanceof Date
        ? row.changed_at
        : new Date(row.changed_at)
      ).toISOString(),
    }));
  }
}

/** Initial value of a track on a freshly created row — written with the row, recorded in history. */
export async function initTrackIn(
  client: PoolClient,
  track: StatusTrack,
  entityId: number,
  value: string,
  userId: number,
): Promise<void> {
  const config = TRACKS[track];
  await writeStatus(client, config, entityId, value, 'manual');
  await insertStatusHistory(client, {
    config,
    entityId,
    from: null,
    to: value,
    source: StatusChangeSource.MANUAL,
    reason: null,
    userId,
  });
}

export async function insertAuditLog(
  client: PoolClient,
  entry: AuditEntry,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (entity_type, entity_id, action, before_value, after_value, reason, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.entityType,
      entry.entityId,
      entry.action,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.reason ?? null,
      entry.userId,
    ],
  );
}

async function readCurrent(
  client: PoolClient,
  config: TrackConfig,
  entityId: number,
): Promise<string | null> {
  const result = await client.query<{
    value: string | null;
    in_scope: boolean;
  }>(
    `SELECT ${config.column} AS value, (${config.scope}) AS in_scope
       FROM ${config.table} WHERE id = $1 FOR UPDATE`,
    [entityId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundException(`${config.entityType} ${entityId} not found`);
  }
  if (!row.in_scope) {
    throw new BadRequestException(config.scopeError);
  }
  return row.value;
}

async function writeStatus(
  client: PoolClient,
  config: TrackConfig,
  entityId: number,
  value: string | null,
  source: 'manual' | 'auto' | null,
): Promise<void> {
  const sets = [`${config.column} = $1`, 'updated_at = now()'];
  const params: unknown[] = [value];
  if (config.sourceColumn) {
    params.push(source);
    sets.push(`${config.sourceColumn} = $${params.length}`);
  }
  params.push(entityId);
  await client.query(
    `UPDATE ${config.table} SET ${sets.join(', ')} WHERE id = $${params.length}`,
    params,
  );
}

async function insertStatusHistory(
  client: PoolClient,
  entry: {
    config: TrackConfig;
    entityId: number;
    from: string | null;
    to: string | null;
    source: StatusChangeSource;
    reason: string | null;
    userId: number;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO status_history (entity_type, entity_id, track, from_value, to_value, source, reason, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.config.entityType,
      entry.entityId,
      entry.config.track,
      entry.from,
      entry.to,
      entry.source,
      entry.reason,
      entry.userId,
    ],
  );
}
