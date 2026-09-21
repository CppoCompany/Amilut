import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { ShipmentDocumentType } from '../shipments.enums';

/**
 * Payload for opening a shipment file. `orderIds` are the orders it groups
 * together (1 case → many orders; each order belongs to at most one case at
 * a time — associating an order here reassigns it away from any other case
 * it was previously in); every other field is optional and filled in over
 * time as the file progresses.
 */
export class CreateShipmentDto {
  @ApiProperty({ type: 'integer', isArray: true, example: [1000, 1002] })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  orderIds!: number[];

  // ── זיהוי מסמך — Document Type & Number ────────────────────────────────────
  @ApiPropertyOptional({ example: 'NEXF123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  billOfLadingNumber?: string;

  @ApiPropertyOptional({ enum: ShipmentDocumentType, enumName: 'ShipmentDocumentType' })
  @IsOptional()
  @IsEnum(ShipmentDocumentType)
  documentType?: ShipmentDocumentType;

  @ApiPropertyOptional({ format: 'date', example: '2026-05-27' })
  @IsOptional()
  @IsDateString()
  blIssueDate?: string;

  // ── מוביל — Forwarder ───────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'MSC Mediterranean Shipping Co.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  forwarderName?: string;

  @ApiPropertyOptional({ example: 'VN624A' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  voyageFlightNumber?: string;

  @ApiPropertyOptional({ example: 'MSC NAPOLI' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vesselName?: string;

  @ApiPropertyOptional({ example: 'NAPOLI' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  portOfLoading?: string;

  @ApiPropertyOptional({ example: 'HAIFA' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  portOfDischarge?: string;

  @ApiPropertyOptional({ example: '264768' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  manifestNumber?: string;

  @ApiPropertyOptional({ example: '12345A22' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  transactionNumber?: string;

  // ── שוגר — Shipper ──────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Shanghai Tech Components Co., Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  shipperName?: string;

  @ApiPropertyOptional({ example: 'אלי ויזל 5' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shipperAddress?: string;

  // ── נמען — Consignee ────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'NexTrade Import Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  consigneeName?: string;

  @ApiPropertyOptional({ example: 'שמעון פרס 11' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  consigneeAddress?: string;

  // ── Notify Party ────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'NexFreight Logistics - Israel' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notifyParty?: string;

  // ── מטען — Cargo ────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Electronic Components - Motherboards & Power Units' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cargoDescription?: string;

  @ApiPropertyOptional({ type: 'integer', example: 120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  packageCount?: number;

  @ApiPropertyOptional({ example: 'Cartons' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  packageUnit?: string;

  @ApiPropertyOptional({ example: 1850 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grossWeightKg?: number;

  @ApiPropertyOptional({ example: 1720 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  netWeightKg?: number;

  @ApiPropertyOptional({ example: 9.8 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeCbm?: number;

  // ── מכס — Tariff HS Code ────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: '8504' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  hsCode?: string;

  // ── תנאים — Terms ───────────────────────────────────────────────────────────
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dangerousGoods?: boolean;

  @ApiPropertyOptional({ example: 'Class 9' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  dangerousGoodsImoClass?: string;

  // ── מסמכים — Documents (container) ──────────────────────────────────────────
  @ApiPropertyOptional({ example: 'MSCU7845123' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  containerNumber?: string;

  @ApiPropertyOptional({ example: '40HC' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  containerType?: string;

  @ApiPropertyOptional({ example: 'SH98765421' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  containerSealNumber?: string;
}
