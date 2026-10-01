import { ApiProperty } from '@nestjs/swagger';
import { MblShippingType, SeaMethod } from '../mbl.enums';

/** One row of "התיקים שלי" — the MBL/HBL workflow's shipping-case grid.
 *  `orderIds`/`customerNames` are aggregated across every HBL under this MBL
 *  (not the MBL's own `customerId`, which is only set for `fcl_lcl`). */
export class MblSummaryDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ enum: MblShippingType, enumName: 'MblShippingType' })
  shippingType!: MblShippingType;

  @ApiProperty({ enum: SeaMethod, enumName: 'SeaMethod', nullable: true })
  seaMethod!: SeaMethod | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'MBL-987654321' })
  mblNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'MAERSK LINE' })
  carrierName!: string | null;

  @ApiProperty({ type: 'integer', example: 3 })
  hblCount!: number;

  @ApiProperty({ type: 'integer', isArray: true, example: [1000, 1002] })
  orderIds!: number[];

  @ApiProperty({ type: 'string', isArray: true, example: ['ACME Ltd.'] })
  customerNames!: string[];

  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  createdAt!: string;
}
