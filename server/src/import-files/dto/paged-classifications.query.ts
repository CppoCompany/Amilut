import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { PagedQuery } from '../../common/paging/paged.query';

/** Client sort keys for GET /import-files/classifications → whitelisted SQL expressions. */
export const CLASSIFICATION_SORT_COLUMNS = {
  createdAt: 'f.created_at',
  orderId: 'f.order_id',
  ccfId: 'f.ccf_id',
  item: `li.item->>'item'`,
  classificationCode: `li.item->'classification'->>'classificationCode'`,
} as const;
export type ClassificationSortKey = keyof typeof CLASSIFICATION_SORT_COLUMNS;
export const CLASSIFICATION_SORT_KEYS = Object.keys(
  CLASSIFICATION_SORT_COLUMNS,
) as ClassificationSortKey[];

/** Query string for GET /import-files/classifications — "הסיווגים שלי". */
export class PagedClassificationsQuery extends PagedQuery {
  /** Only lines filed under this order (`orders.id`). */
  @ApiPropertyOptional({ type: 'integer', example: 1024 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  orderId?: number;

  /** Only lines filed under this Customs Clearance File (`customs_clearance_files.id`). */
  @ApiPropertyOptional({ type: 'integer', example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ccfId?: number;

  @ApiPropertyOptional({ enum: CLASSIFICATION_SORT_KEYS, default: 'createdAt' })
  @IsOptional()
  @IsIn(CLASSIFICATION_SORT_KEYS)
  sort?: ClassificationSortKey;
}
