import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NotificationDto } from './dto/notification.dto';
import {
  CreateNotificationInput,
  INSERT_NOTIFICATION_SQL,
  notificationParams,
} from './notifications.util';

interface NotificationRow {
  id: number;
  message: string;
  related_ccf_id: number | null;
  actor_user_id: number | null;
  actor_name: string | null;
  is_read: boolean;
  created_at: Date | string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  /** Standalone creation — no caller transaction to join. `CcfService` does
   *  NOT use this; it calls `insertNotification` (`notifications.util.ts`)
   *  directly with its own transaction's client instead, so a CCF and its
   *  notification commit or roll back together. */
  async create(input: CreateNotificationInput): Promise<{ id: number }> {
    const row = await this.db.queryOne<{ id: number }>(
      INSERT_NOTIFICATION_SQL,
      notificationParams(input),
    );
    return row!;
  }

  /** Latest 50 notifications for the bell dropdown and the dashboard's
   *  "הודעות" widget, newest first, with the triggering user's name. */
  async listForUser(userId: number): Promise<NotificationDto[]> {
    const rows = await this.db.query<NotificationRow>(
      `SELECT n.id, n.message, n.related_ccf_id, n.actor_user_id,
              u.name AS actor_name, n.is_read, n.created_at
         FROM notifications n
         LEFT JOIN users u ON u.id = n.actor_user_id
        WHERE n.recipient_user_id = $1
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT 50`,
      [userId],
    );
    return rows.map(toNotificationDto);
  }

  async unreadCount(userId: number): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `SELECT count(*) FROM notifications WHERE recipient_user_id = $1 AND is_read = false`,
      [userId],
    );
    return Number(row?.count ?? 0);
  }

  /** `WHERE recipient_user_id = $2` doubles as the auth check — a user can
   *  only mark their own notifications read; a 404 either way (bad id or
   *  someone else's) avoids leaking which is which. */
  async markRead(id: number, userId: number): Promise<void> {
    const row = await this.db.queryOne<{ id: number }>(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND recipient_user_id = $2 RETURNING id`,
      [id, userId],
    );
    if (!row) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
  }

  /**
   * Marks every unread notification of the user with `id <= upToId` read —
   * what the dashboard does once its "הודעות" widget has shown them — and
   * returns how many are still unread (any that arrived after `upToId`).
   */
  async markAllRead(userId: number, upToId: number): Promise<number> {
    await this.db.query(
      `UPDATE notifications SET is_read = true
        WHERE recipient_user_id = $1 AND id <= $2 AND is_read = false`,
      [userId, upToId],
    );
    return this.unreadCount(userId);
  }
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    message: row.message,
    relatedCcfId: row.related_ccf_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    isRead: row.is_read,
    createdAt: toIsoString(row.created_at),
  };
}
