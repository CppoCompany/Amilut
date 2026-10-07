import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PagedQuery } from '../../common/paging/paged.query';
import { MblStatus } from '../mbl.enums';

/** Client sort keys for GET /mbl/paged → whitelisted SQL expressions. */
export const MBL_SORT_COLUMNS = {
  id: 'm.id',
  mblNumber: 'm.mbl_number',
  carrierName: 'm.carrier_name',
  status: 'm.status',
  createdAt: 'm.created_at',
} as const;
export type MblSortKey = keyof typeof MBL_SORT_COLUMNS;
export const MBL_SORT_KEYS = Object.keys(MBL_SORT_COLUMNS) as MblSortKey[];

/**
 * Query string for GET /mbl/paged — one endpoint serves three lists:
 * "התיקים שלי" (`mine=true`), "תיקים בהתרה" (`status=in_release`) and
 * "תהליכי יבוא" (no scoping at all).
 */
export class PagedMblQuery extends PagedQuery {
  /** Only cases opened by the signed-in user (`handler_user_id` = JWT sub). */
  @ApiPropertyOptional({ type: 'boolean', default: false })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1' || value === 1,
  )
  @IsBoolean()
  mine?: boolean = false;

  @ApiPropertyOptional({ enum: MblStatus, enumName: 'MblStatus' })
  @IsOptional()
  @IsEnum(MblStatus)
  status?: MblStatus;

  /** Matches an MBL whose own customer, or any of its HBLs' customers, is this one. */
  @ApiPropertyOptional({ type: 'integer', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customerId?: number;

  /** Substring match against the carrier name. */
  @ApiPropertyOptional({ example: 'Maersk' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  carrierName?: string;

  @ApiPropertyOptional({ enum: MBL_SORT_KEYS, default: 'createdAt' })
  @IsOptional()
  @IsIn(MBL_SORT_KEYS)
  sort?: MblSortKey;
}
