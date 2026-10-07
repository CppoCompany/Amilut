import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaymentTerms } from '../../orders/orders.enums';
import { MblShippingType, MblStatus, SeaMethod } from '../mbl.enums';
import { CreateMblContainerDto } from './mbl-container.dto';

/**
 * Payload for creating an MBL (step 2 of "יצירת תיק שילוח"). `shippingType`
 * is always required; `seaMethod` is required iff `shippingType = 'sea'`
 * (enforced by the service, not by a decorator — mirrors the DB's own
 * `mbl_sea_method_matches_shipping_type` CHECK as a second guard). Every
 * other field is optional and can be filled in over time via `PATCH /mbl/:id`.
 */
export class CreateMblDto {
  @ApiProperty({ enum: MblShippingType, enumName: 'MblShippingType' })
  @IsEnum(MblShippingType)
  shippingType!: MblShippingType;

  @ApiPropertyOptional({ enum: SeaMethod, enumName: 'SeaMethod' })
  @IsOptional()
  @IsEnum(SeaMethod)
  seaMethod?: SeaMethod;

  // Set only for sea_method = 'fcl_lcl': one customer, shared by every HBL
  // created under this MBL.
  @ApiPropertyOptional({ type: 'integer', example: 3 })
  @IsOptional()
  @IsInt()
  customerId?: number;

  // ── Master document identification ──────────────────────────────────────────
  @ApiPropertyOptional({ example: 'MBL-987654321' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  mblNumber?: string;

  @ApiPropertyOptional({ example: 'BKG-456789' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bookingNumber?: string;

  @ApiPropertyOptional({ example: 'EVER GLORY' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vesselName?: string;

  @ApiPropertyOptional({ example: '062W' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  voyageNumber?: string;

  @ApiPropertyOptional({ example: 'Shanghai, China' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  portOfLoading?: string;

  @ApiPropertyOptional({ example: 'Haifa, Israel' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  portOfDischarge?: string;

  @ApiPropertyOptional({ example: 'Haifa, Israel' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  finalDestination?: string;

  // ── Shipper / Consignee / Notify Party (the consolidator's, on the master) ──
  @ApiPropertyOptional({ example: 'GLOBAL CONSOLIDATION LTD.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  shipperName?: string;

  @ApiPropertyOptional({ example: 'No. 12, Seaport Road, Shanghai, China' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shipperAddress?: string;

  @ApiPropertyOptional({
    example: 'TO ORDER OF MAERSK LINE (As per House B/L)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  consigneeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  consigneeAddress?: string;

  @ApiPropertyOptional({ example: 'EREZ LOGISTICS LTD.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notifyPartyName?: string;

  @ApiPropertyOptional({ example: 'Haifa, Israel' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notifyPartyAddress?: string;

  // ── Single-container fields — fcl_fcl / fcl_lcl / lcl_lcl only ─────────────
  @ApiPropertyOptional({ example: 'MSKU1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  containerNumber?: string;

  @ApiPropertyOptional({ example: 'TCLU1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  containerSealNumber?: string;

  @ApiPropertyOptional({ example: 'CONSOLIDATED CARGO' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cargoDescription?: string;

  @ApiPropertyOptional({ example: 5400 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grossWeightKg?: number;

  @ApiPropertyOptional({ example: 25.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeCbm?: number;

  // ── Freight & charges ────────────────────────────────────────────────────────
  @ApiPropertyOptional({ enum: PaymentTerms, enumName: 'PaymentTerms' })
  @IsOptional()
  @IsEnum(PaymentTerms)
  freightTerms?: PaymentTerms;

  @ApiPropertyOptional({ example: 'CY/CFS' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  receiptDeliveryType?: string;

  // ── Issue details ────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'SHANGHAI' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  placeOfIssue?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-09-20' })
  @IsOptional()
  @IsDateString()
  dateOfIssue?: string;

  @ApiPropertyOptional({ example: 'MAERSK LINE' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  carrierName?: string;

  /** Lifecycle status of the case. Defaults to `open` when omitted on creation. */
  @ApiPropertyOptional({
    enum: MblStatus,
    enumName: 'MblStatus',
    default: MblStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(MblStatus)
  status?: MblStatus;

  // ── Containers table — groupage_fcl only ────────────────────────────────────
  @ApiPropertyOptional({ type: CreateMblContainerDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMblContainerDto)
  containers?: CreateMblContainerDto[];
}
