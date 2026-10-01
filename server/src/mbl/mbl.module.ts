import { Module } from '@nestjs/common';
import { HblController } from './hbl.controller';
import { HblService } from './hbl.service';
import { MblController } from './mbl.controller';
import { MblService } from './mbl.service';

/** The MBL/HBL "יצירת תיק שילוח" workflow — the only shipping-case workflow
 *  (the legacy `order_account`/`ShipmentsModule` flow was removed, see
 *  migration 016). DatabaseService is a global provider, so no database
 *  module import is needed. */
@Module({
  controllers: [MblController, HblController],
  providers: [MblService, HblService],
  exports: [MblService, HblService],
})
export class MblModule {}
