import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

/** Query string for GET /hbl — lists every HBL under one MBL, ordered by
 *  sequence. The sidebar's source for the MBL → HBL tree. */
export class ListHblQuery {
  @ApiProperty({ type: 'integer', example: 1000 })
  @Type(() => Number)
  @IsInt()
  mblId!: number;
}
