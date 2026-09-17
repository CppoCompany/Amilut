import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { OrderStatus } from '../orders.enums';

/** Query string for GET /orders. */
export class ListOrdersQuery {
  @ApiPropertyOptional({ type: 'integer', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional({ type: 'integer', example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  handlerUserId?: number;

  @ApiPropertyOptional({ enum: OrderStatus, enumName: 'OrderStatus' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** Matches orders created on this calendar date (server local date of `created_at`). */
  @ApiPropertyOptional({ format: 'date', example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  createdDate?: string;

  /** Include soft-deleted orders. */
  @ApiPropertyOptional({ type: 'boolean', default: false })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1' || value === 1,
  )
  @IsBoolean()
  includeInactive?: boolean = false;

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
