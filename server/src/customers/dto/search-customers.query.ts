import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export const SEARCH_MIN_QUERY_LENGTH = 3;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;

/** Query string for `GET /customers?q=...&limit=...` (autocomplete). */
export class SearchCustomersQuery {
  @ApiProperty({
    description: 'Case-insensitive substring of the customer name',
    minLength: SEARCH_MIN_QUERY_LENGTH,
    example: 'acm',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(SEARCH_MIN_QUERY_LENGTH)
  q!: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: SEARCH_MAX_LIMIT,
    default: SEARCH_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_MAX_LIMIT)
  limit: number = SEARCH_DEFAULT_LIMIT;
}
