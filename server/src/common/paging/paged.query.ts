import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 100;

export type SortDir = 'asc' | 'desc';
export const SORT_DIRS: readonly SortDir[] = ['asc', 'desc'];

/**
 * Query-string base for every paginated "view all" list endpoint. Feature
 * query classes extend it with their own `sort` whitelist (`@IsIn`) and any
 * entity-specific filters (status, customerId, …). `from`/`to` bound the
 * row's `created_at` calendar date (inclusive, server-local date).
 */
export class PagedQuery {
  /** Free-text search over the list's main identifiers/names (ILIKE substring). */
  @ApiPropertyOptional({ example: 'ACME', maxLength: 200 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(200)
  q?: string;

  /** Created on or after this calendar date. */
  @ApiPropertyOptional({ format: 'date', example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Created on or before this calendar date. */
  @ApiPropertyOptional({ format: 'date', example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: SORT_DIRS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_DIRS)
  dir?: SortDir;

  /** 1-based page number. */
  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: PAGE_SIZE_MAX,
    default: PAGE_SIZE_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_SIZE_MAX)
  pageSize?: number = PAGE_SIZE_DEFAULT;
}
