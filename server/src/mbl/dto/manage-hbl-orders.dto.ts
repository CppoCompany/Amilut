import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt } from 'class-validator';

/**
 * Replaces the full set of orders associated with an HBL. An empty array is
 * valid — order association is optional for an HBL (a case can be created
 * and saved with none).
 */
export class ManageHblOrdersDto {
  @ApiProperty({ type: 'integer', isArray: true, example: [1000] })
  @IsArray()
  @IsInt({ each: true })
  orderIds!: number[];
}
