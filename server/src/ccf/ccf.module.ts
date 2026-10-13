import { Module } from '@nestjs/common';
import { CcfController } from './ccf.controller';
import { CcfService } from './ccf.service';

/** "תיק סליקת מכס" — can exist standalone or linked 1:1 to an existing MBL
 *  shipping case (`shipment_file_id` → `mbl.id`, migration 019). On create,
 *  notifies the linked case's handler (or the CCF's own creator when
 *  unlinked, or that case has no handler on record) via
 *  `insertNotification` (`server/src/notifications/notifications.util.ts`),
 *  run inside the same transaction as the CCF insert. DatabaseService is a
 *  global provider, so no database module import is needed. */
@Module({
  controllers: [CcfController],
  providers: [CcfService],
  exports: [CcfService],
})
export class CcfModule {}
