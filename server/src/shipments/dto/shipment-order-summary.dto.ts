import { ApiProperty } from '@nestjs/swagger';

/** One order associated with a shipment case, embedded in `ShipmentDto`. */
export class ShipmentOrderSummaryDto {
  @ApiProperty({ type: 'integer', example: 1000 })
  id!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'ACME Ltd.' })
  customerName!: string | null;
}
