import type { PoolClient } from 'pg';

export interface CreateNotificationInput {
  recipientUserId: number;
  message: string;
  relatedCcfId?: number | null;
  /** The user whose action triggered the notification (`users.id`). */
  actorUserId?: number | null;
}

/** Shared by `insertNotification` and `NotificationsService.create` so the
 *  two insert paths (inside a caller's transaction vs. standalone) can never
 *  drift apart. */
export const INSERT_NOTIFICATION_SQL = `
  INSERT INTO notifications (recipient_user_id, message, related_ccf_id, actor_user_id)
  VALUES ($1, $2, $3, $4)
  RETURNING id`;

export function notificationParams(input: CreateNotificationInput): unknown[] {
  return [
    input.recipientUserId,
    input.message,
    input.relatedCcfId ?? null,
    input.actorUserId ?? null,
  ];
}

/**
 * Inserts one notification row using the given transaction's `PoolClient` —
 * so the insert commits or rolls back together with whatever else that
 * transaction is doing. `CcfService.create` uses this (not
 * `NotificationsService.create`) specifically so a Customs Clearance File
 * and its notification always succeed or fail together, never one without
 * the other. For a standalone insert with no transaction to join, use
 * `NotificationsService.create` instead.
 */
export async function insertNotification(
  client: PoolClient,
  input: CreateNotificationInput,
): Promise<{ id: number }> {
  const result = await client.query<{ id: number }>(
    INSERT_NOTIFICATION_SQL,
    notificationParams(input),
  );
  return result.rows[0];
}
