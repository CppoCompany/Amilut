import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional } from 'class-validator';
import { PagedQuery } from '../../common/paging/paged.query';
import { OrderStatus } from '../orders.enums';

/** Client sort keys for GET /orders/paged → whitelisted SQL expressions. */
export const ORDER_SORT_COLUMNS = {
  id: 'o.id',
  customerName: 'c.name',
  status: 'o.status',
  createdAt: 'o.created_at',
} as const;
export type OrderSortKey = keyof typeof ORDER_SORT_COLUMNS;
export const ORDER_SORT_KEYS = Object.keys(
  ORDER_SORT_COLUMNS,
) as OrderSortKey[];

/** Query string for GET /orders/paged — "ההזמנות שלי" (the signed-in handler's orders). */
export class PagedOrdersQuery extends PagedQuery {
  @ApiPropertyOptional({ enum: OrderStatus, enumName: 'OrderStatus' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ type: 'integer', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional({ enum: ORDER_SORT_KEYS, default: 'createdAt' })
  @IsOptional()
  @IsIn(ORDER_SORT_KEYS)
  sort?: OrderSortKey;
}
