import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MblShippingType } from '../mbl.enums';
import { PieceDimensionDto } from './piece-dimension.dto';

/**
 * Payload for creating one "Internal B/L" (HBL) under an MBL. `containerId`
 * is required only when the parent MBL's `seaMethod = 'groupage_fcl'`
 * (enforced by the service — it also checks the container actually belongs
 * to `mblId`). Order association is optional at creation, and can be
 * changed later via `PATCH /hbl/:id/orders`.
 *
 * Air: a HAWB may be created before its MAWB exists — omit `mblId` and send
 * `shippingType: 'air'`; link it later via `PATCH /hbl/:id/master`. A sea
 * HBL always needs `mblId`.
 */
export class CreateHblDto {
  @ApiPropertyOptional({ type: 'integer', example: 1000 })
  @IsOptional()
  @IsInt()
  mblId?: number;

  /** Required when `mblId` is omitted (then it must be `air`); otherwise taken from the MBL. */
  @ApiPropertyOptional({ enum: MblShippingType, enumName: 'MblShippingType' })
  @IsOptional()
  @IsEnum(MblShippingType)
  shippingType?: MblShippingType;

  @ApiPropertyOptional({ type: 'integer', example: 1 })
  @IsOptional()
  @IsInt()
  containerId?: number;

  @ApiProperty({ type: 'integer', example: 3 })
  @IsInt()
  customerId!: number;

  // ── HBL identification ──────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'HBL-ERZ-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  hblNumber?: string;

  // ── Shipper / Consignee / Notify Party — HBL-specific, not inherited ───────
  @ApiPropertyOptional({ example: 'Alpha Tools Co.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  shipperName?: string;

  @ApiPropertyOptional({ example: 'Shanghai, China' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shipperAddress?: string;

  @ApiPropertyOptional({ example: 'אלפא בע"מ' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  consigneeName?: string;

  @ApiPropertyOptional({ example: 'Tel Aviv, Israel' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  consigneeAddress?: string;

  @ApiPropertyOptional({ example: 'Alpha Tools Co.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notifyPartyName?: string;

  @ApiPropertyOptional({ example: 'Shanghai, China' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notifyPartyAddress?: string;

  // ── This customer's cargo ────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Hand Tools (assorted)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cargoDescription?: string;

  @ApiPropertyOptional({ example: '120 cartons' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  quantity?: string;

  @ApiPropertyOptional({ example: 1850 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grossWeightKg?: number;

  @ApiPropertyOptional({ example: 8.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeCbm?: number;

  @ApiPropertyOptional({ example: 'LCL - 3 PARTIES / CY/CFS' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;

  // ── Air (HAWB) only — rejected on a sea HBL ─────────────────────────────────
  /** Expected number of pieces — arrivals are counted against it. */
  @ApiPropertyOptional({ type: 'integer', example: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  pieces?: number;

  /** Dimension lines for volumetric weight. When provided it REPLACES all lines. */
  @ApiPropertyOptional({ type: PieceDimensionDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PieceDimensionDto)
  pieceDimensions?: PieceDimensionDto[];

  /** The chargeable weight on / approved from the HAWB. Differing from the
   *  calculated value is an override and needs `chargeableWeightOverrideReason`. */
  @ApiPropertyOptional({ type: 'number', nullable: true, example: 120.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  approvedChargeableWeightKg?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  chargeableWeightOverrideReason?: string;

  @ApiPropertyOptional({ type: 'string', isArray: true, example: ['DGR'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[A-Z0-9]{2,4}$/, { each: true })
  specialHandlingCodes?: string[];

  // ── Optional order association at creation time ─────────────────────────────
  @ApiPropertyOptional({ type: 'integer', isArray: true, example: [1000] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  orderIds?: number[];
}
