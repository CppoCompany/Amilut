import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Links an air HAWB to a MAWB, moves it to another one, or detaches it
 * (`mblId: null`). Before the first arrival any user may do this freely
 * (`reason` optional). Once pieces were received it is a correction: the
 * service requires `reason`. Every change is written to
 * `hbl_master_link_history`.
 */
export class LinkHblMasterDto {
  @ApiProperty({ type: 'integer', nullable: true, example: 12 })
  @ValidateIf((dto: LinkHblMasterDto) => dto.mblId !== null)
  @IsInt()
  mblId!: number | null;

  @ApiPropertyOptional({ example: 'Offloaded and rebooked on the next flight' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** One arrival event of a HAWB: pieces received on one flight. */
export class CreateHblArrivalDto {
  @ApiProperty({ example: 'LY 008' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  flightNumber!: string;

  @ApiProperty({ format: 'date', example: '2026-10-21' })
  @IsDateString()
  arrivalDate!: string;

  @ApiProperty({ type: 'integer', example: 4 })
  @IsInt()
  @Min(1)
  piecesReceived!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Explicitly accept a total above the expected pieces (needs `overrideReason`). */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  override?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;
}

/** Voids a wrongly entered arrival (rows are never deleted). */
export class VoidHblArrivalDto {
  @ApiProperty({ example: 'Recorded on the wrong HAWB' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class HblArrivalDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ example: 'LY 008' })
  flightNumber!: string;

  @ApiProperty({ format: 'date', example: '2026-10-21' })
  arrivalDate!: string;

  @ApiProperty({ type: 'integer', example: 4 })
  piecesReceived!: number;

  @ApiProperty({ type: 'string', nullable: true })
  notes!: string | null;

  @ApiProperty({ example: false })
  isOverride!: boolean;

  @ApiProperty({ type: 'string', nullable: true })
  overrideReason!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Dana Levi' })
  createdByName!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  /** Set once the row was voided — it then no longer counts. */
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  voidedAt!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  voidedByName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  voidReason!: string | null;
}

/** One `hbl_master_link_history` row, newest first. */
export class HblLinkHistoryEntryDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ type: 'integer', nullable: true, example: 11 })
  previousMblId!: number | null;

  @ApiProperty({ type: 'string', nullable: true, example: '114-12345675' })
  previousMblNumber!: string | null;

  @ApiProperty({ type: 'integer', nullable: true, example: 12 })
  newMblId!: number | null;

  @ApiProperty({ type: 'string', nullable: true, example: '114-12345686' })
  newMblNumber!: string | null;

  @ApiProperty({ example: false })
  isCorrection!: boolean;

  @ApiProperty({ type: 'string', nullable: true })
  reason!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Dana Levi' })
  changedByName!: string | null;

  @ApiProperty({ format: 'date-time' })
  changedAt!: string;
}
