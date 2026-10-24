import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { CcfStatus } from '../ccf.enums';

/** Query string for `GET /ccf` — feeds the Order/CCF picker (requirement 6
 *  of the Import Paperwork Filing re-scope) a batch list, the same shape
 *  `OrdersApi.list()`/`MblApi.list()` already serve their own pickers. */
export class ListCcfQuery {
  @ApiPropertyOptional({ enum: CcfStatus, enumName: 'CcfStatus' })
  @IsOptional()
  @IsEnum(CcfStatus)
  status?: CcfStatus;

  @ApiPropertyOptional({ type: 'integer', example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shipmentFileId?: number;

  @ApiPropertyOptional({ type: 'integer', example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  hblId?: number;

  @ApiPropertyOptional({ type: 'integer', example: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
