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
  OrderStatus,
  PaymentTerms,
  ShipmentType,
} from '../orders.enums';

export class CreateOrderDto {
  @ApiProperty({ type: 'integer', example: 1 })
  @IsInt()
  customerId!: number;

  @ApiPropertyOptional({ type: 'integer', example: 7 })
  @IsOptional()
  @IsInt()
  handlerUserId?: number;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiProperty({ enum: ShipmentType, enumName: 'ShipmentType' })
  @IsEnum(ShipmentType)
  shipmentType!: ShipmentType;

  @ApiProperty({ enum: PaymentTerms, enumName: 'PaymentTerms' })
  @IsEnum(PaymentTerms)
  paymentTerms!: PaymentTerms;

  /** Free-text for now (e.g. "FOB", "CIF"); may become an enum later. */
  @ApiPropertyOptional({ example: 'FOB' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  incoterm?: string;

  @ApiProperty({ enum: Destination, enumName: 'Destination' })
  @IsEnum(Destination)
  destination!: Destination;

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
  @MaxLength(20)
  flightNumber?: string;
}
