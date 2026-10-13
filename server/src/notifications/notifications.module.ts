import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Minimal, reusable in-app notification system — first consumer is the CCF
 *  feature (`server/src/ccf/`), which inserts notifications directly via
 *  `insertNotification` (`notifications.util.ts`) inside its own
 *  transaction rather than through `NotificationsService`, so a CCF and its
 *  notification always commit or roll back together. DatabaseService is a
 *  global provider, so no database module import is needed. */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
