import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Query string for GET /mbl — the "התיקים שלי" grid. */
export class ListMblQuery {
  /** Matches an MBL where any of its HBLs (or, for `fcl_lcl`, the MBL itself) use this customer. */
  @ApiPropertyOptional({ type: 'integer', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customerId?: number;

  /** Substring match against the carrier name. */
  @ApiPropertyOptional({ example: 'Maersk' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  carrierName?: string;

  /** Exact match against the MBL's own id. */
  @ApiPropertyOptional({ type: 'integer', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  caseNumber?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 200,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
