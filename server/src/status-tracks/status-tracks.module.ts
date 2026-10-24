import { Module } from '@nestjs/common';
import { StatusTracksController } from './status-tracks.controller';
import { StatusTracksService } from './status-tracks.service';

/** Shared status-track architecture (shipment / document / clearance) and its
 *  append-only history; used by the MBL, HBL and CCF modules. */
@Module({
  controllers: [StatusTracksController],
  providers: [StatusTracksService],
  exports: [StatusTracksService],
})
export class StatusTracksModule {}
