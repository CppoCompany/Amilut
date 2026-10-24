import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';

/** Query string for GET /hbl — exactly one of:
 *  - `mblId`: every real HBL under one MBL, ordered by sequence (the
 *    sidebar's source for the MBL → HBL tree; a Direct MAWB's hidden mirror
 *    house is never listed);
 *  - `unassigned=true`: air HAWBs not yet linked to any MAWB, newest first. */
export class ListHblQuery {
  @ApiPropertyOptional({ type: 'integer', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mblId?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1' || value === 1,
  )
  @IsBoolean()
  unassigned?: boolean;
}
