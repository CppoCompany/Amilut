import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

/**
 * Payload for `PATCH /shipments/:id/orders` — replaces the full set of
 * orders associated with a case. Orders removed from the list are freed
 * (their `case_id` cleared); orders newly listed are reassigned to this case.
 */
export class ManageShipmentOrdersDto {
  @ApiProperty({ type: 'integer', isArray: true, example: [1000, 1002] })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  orderIds!: number[];
}
