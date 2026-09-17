import { ApiProperty } from '@nestjs/swagger';
import { ShipmentDocumentType } from '../shipments.enums';

/** One row of the shipment files grid ("התיקים שלי"). */
export class ShipmentSummaryDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ type: 'integer', example: 1000 })
  orderId!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'ACME Ltd.' })
  customerName!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'NEXF123456789' })
  billOfLadingNumber!: string | null;

  @ApiProperty({
    enum: ShipmentDocumentType,
    enumName: 'ShipmentDocumentType',
    nullable: true,
  })
  documentType!: ShipmentDocumentType | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'MSC Mediterranean Shipping Co.',
  })
  forwarderName!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  createdAt!: string;
}
