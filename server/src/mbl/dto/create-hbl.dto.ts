import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

/**
 * Payload for creating one "Internal B/L" (HBL) under an MBL. `containerId`
 * is required only when the parent MBL's `seaMethod = 'groupage_fcl'`
 * (enforced by the service — it also checks the container actually belongs
 * to `mblId`). Order association is optional at creation, and can be
 * changed later via `PATCH /hbl/:id/orders`.
 */
export class CreateHblDto {
  @ApiProperty({ type: 'integer', example: 1000 })
  @IsInt()
  mblId!: number;

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

  // ── Optional order association at creation time ─────────────────────────────
  @ApiPropertyOptional({ type: 'integer', isArray: true, example: [1000] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  orderIds?: number[];
}
