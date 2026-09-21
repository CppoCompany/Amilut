import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  Destination,
  Incoterm,
  OrderStatus,
  PaymentTerms,
  ShipmentType,
} from '../orders.enums';

/**
 * Payload for opening a new order. The order number (`id`), `createdAt` and
 * the handler (`handlerUserId`, taken from the JWT) are set by the server and
 * can never be supplied by the client.
 */
export class CreateOrderDto {
  @ApiProperty({ type: 'integer', example: 1 })
  @IsInt()
  customerId!: number;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiProperty({ enum: ShipmentType, enumName: 'ShipmentType' })
  @IsEnum(ShipmentType)
  shipmentType!: ShipmentType;

  @ApiProperty({ enum: PaymentTerms, enumName: 'PaymentTerms' })
  @IsEnum(PaymentTerms)
  paymentTerms!: PaymentTerms;

  /** Must belong to INCOTERMS_BY_PAYMENT_TERMS[paymentTerms] (checked in the service). */
  @ApiProperty({ enum: Incoterm, enumName: 'Incoterm' })
  @IsEnum(Incoterm)
  incoterm!: Incoterm;

  @ApiProperty({ enum: Destination, enumName: 'Destination' })
  @IsEnum(Destination)
  destination!: Destination;

  @ApiPropertyOptional({ type: 'integer', example: 1 })
  @IsOptional()
  @IsInt()
  supplierId?: number;

  @ApiPropertyOptional({ format: 'date', example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  factoryReadyDate?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-09-03' })
  @IsOptional()
  @IsDateString()
  factoryPickupDate?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-09-10' })
  @IsOptional()
  @IsDateString()
  departureDate?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-10-05' })
  @IsOptional()
  @IsDateString()
  etaDate?: string;

  @ApiPropertyOptional({ example: 'ZIM' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingLine?: string;

  @ApiPropertyOptional({ example: 'ZIM123E' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  voyageNumber?: string;

  @ApiPropertyOptional({ example: 'EL AL' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  airline?: string;

  @ApiPropertyOptional({ example: 'LY001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  flightNumber?: string;
}
