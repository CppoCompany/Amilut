import { Module } from '@nestjs/common';
import { HblController } from './hbl.controller';
import { HblService } from './hbl.service';
import { MblController } from './mbl.controller';
import { MblService } from './mbl.service';

/** The new MBL/HBL "יצירת תיק שילוח" workflow — parallel to (and independent
 *  of) `ShipmentsModule`'s legacy `order_account` flow. DatabaseService is a
 *  global provider, so no database module import is needed. */
@Module({
  controllers: [MblController, HblController],
  providers: [MblService, HblService],
  exports: [MblService, HblService],
})
export class MblModule {}
