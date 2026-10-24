import { Module } from '@nestjs/common';
import { AirModule } from '../air/air.module';
import { StatusTracksModule } from '../status-tracks/status-tracks.module';
import { HawbService } from './hawb.service';
import { HblController } from './hbl.controller';
import { HblService } from './hbl.service';
import { MblController } from './mbl.controller';
import { MblService } from './mbl.service';

/** The MBL/HBL "יצירת תיק שילוח" workflow — the only shipping-case workflow
 *  (the legacy `order_account`/`ShipmentsModule` flow was removed, see
 *  migration 016). DatabaseService is a global provider, so no database
 *  module import is needed. */
@Module({
  imports: [AirModule, StatusTracksModule],
  controllers: [MblController, HblController],
  providers: [MblService, HblService, HawbService],
  exports: [MblService, HblService],
})
export class MblModule {}
