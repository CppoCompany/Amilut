import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { PagedQuery } from '../../common/paging/paged.query';

/** Client sort keys for GET /import-files/classifications → whitelisted SQL expressions. */
export const CLASSIFICATION_SORT_COLUMNS = {
  createdAt: 'f.created_at',
  accountId: 'f.account_id',
  item: `li.item->>'item'`,
  classificationCode: `li.item->'classification'->>'classificationCode'`,
} as const;
export type ClassificationSortKey = keyof typeof CLASSIFICATION_SORT_COLUMNS;
export const CLASSIFICATION_SORT_KEYS = Object.keys(
  CLASSIFICATION_SORT_COLUMNS,
) as ClassificationSortKey[];

/** Query string for GET /import-files/classifications — "הסיווגים שלי". */
export class PagedClassificationsQuery extends PagedQuery {
  /** Only lines filed under this import case (`order_account.id`). */
  @ApiPropertyOptional({ type: 'integer', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  accountId?: number;

  @ApiPropertyOptional({ enum: CLASSIFICATION_SORT_KEYS, default: 'createdAt' })
  @IsOptional()
  @IsIn(CLASSIFICATION_SORT_KEYS)
  sort?: ClassificationSortKey;
}
