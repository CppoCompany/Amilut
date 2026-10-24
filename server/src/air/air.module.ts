import { Module } from '@nestjs/common';
import { AirController } from './air.controller';
import { AirReferenceService } from './air-reference.service';

/** Air-freight lookups (airports, cargo terminals, chargeable-weight rules)
 *  shared by the MAWB/HAWB services and the order validation. */
@Module({
  controllers: [AirController],
  providers: [AirReferenceService],
  exports: [AirReferenceService],
})
export class AirModule {}
