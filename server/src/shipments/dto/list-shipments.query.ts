import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Query string for GET /shipments. */
export class ListShipmentsQuery {
  @ApiPropertyOptional({ type: 'integer', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customerId?: number;

  /** Substring match against the forwarder ("carrier") name. */
  @ApiPropertyOptional({ example: 'MSC' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  forwarderName?: string;

  /** Exact match against the shipment/case's own id. */
  @ApiPropertyOptional({ type: 'integer', example: 1000 })
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
