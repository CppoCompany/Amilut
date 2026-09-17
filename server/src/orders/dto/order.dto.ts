import { ApiProperty } from '@nestjs/swagger';
import {
  Destination,
  Incoterm,
  OrderStatus,
  PaymentTerms,
  ShipmentType,
} from '../orders.enums';

/** Order as returned by the API (joined with customer and handler names). */
export class OrderDto {
  /** Internal order number (sequence starts at 1000). */
  @ApiProperty({ type: 'integer', example: 1000 })
  id!: number;

  @ApiProperty({ type: 'integer', example: 1 })
  customerId!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'ACME Ltd.' })
  customerName!: string | null;

  @ApiProperty({ type: 'integer', nullable: true, example: 7 })
  handlerUserId!: number | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Dana Levi' })
  handlerName!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  updatedAt!: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status!: OrderStatus;

  @ApiProperty({ enum: ShipmentType, enumName: 'ShipmentType' })
  shipmentType!: ShipmentType;

  @ApiProperty({ enum: PaymentTerms, enumName: 'PaymentTerms' })
  paymentTerms!: PaymentTerms;

  @ApiProperty({ enum: Incoterm, enumName: 'Incoterm' })
  incoterm!: Incoterm;

  @ApiProperty({ enum: Destination, enumName: 'Destination' })
  destination!: Destination;

  @ApiProperty({
    type: 'string',
    format: 'date',
    nullable: true,
    example: '2026-09-01',
  })
  factoryReadyDate!: string | null;

  @ApiProperty({
    type: 'string',
    format: 'date',
    nullable: true,
    example: '2026-09-03',
  })
  factoryPickupDate!: string | null;

  @ApiProperty({
    type: 'string',
    format: 'date',
    nullable: true,
    example: '2026-09-10',
  })
  departureDate!: string | null;

  @ApiProperty({
    type: 'string',
    format: 'date',
    nullable: true,
    example: '2026-10-05',
  })
  etaDate!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'ZIM' })
  shippingLine!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'ZIM123E' })
  voyageNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'EL AL' })
  airline!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'LY001' })
  flightNumber!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;
}
