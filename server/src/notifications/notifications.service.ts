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

  /** Latest 50 notifications for the bell dropdown, newest first. */
  async listForUser(userId: number): Promise<NotificationDto[]> {
    const rows = await this.db.query<NotificationRow>(
      `SELECT id, message, related_ccf_id, is_read, created_at
         FROM notifications
        WHERE recipient_user_id = $1
        ORDER BY created_at DESC
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
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    message: row.message,
    relatedCcfId: row.related_ccf_id,
    isRead: row.is_read,
    createdAt: toIsoString(row.created_at),
  };
}
