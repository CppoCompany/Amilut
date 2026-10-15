import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ example: 'נפתח תיק סליקת מכס חדש, מקושר לתיק שילוח 42' })
  message!: string;

  /** The Customs Clearance File this notification is about, when applicable. */
  @ApiProperty({ type: 'integer', nullable: true, example: 7 })
  relatedCcfId!: number | null;

  /** The user whose action triggered the notification; `null` when none was recorded. */
  @ApiProperty({ type: 'integer', nullable: true, example: 7 })
  actorUserId!: number | null;

  /** Joined for display — `null` when `actorUserId` is `null`. */
  @ApiProperty({ type: 'string', nullable: true, example: 'Dana Levi' })
  actorName!: string | null;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  createdAt!: string;
}
