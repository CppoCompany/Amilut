import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Every import-files route is scoped to exactly one of an Order or a
 * Customs Clearance File — never both, never neither. "Exactly one of two
 * optional fields" isn't expressible with plain class-validator decorators,
 * so that check lives in `toImportFilesContext` (`import-files.service.ts`),
 * run after this DTO's own per-field validation passes.
 */
export class ImportFilesContextQuery {
  @ApiPropertyOptional({
    type: 'integer',
    example: 1024,
    description: 'orders.id',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId?: number;

  @ApiPropertyOptional({
    type: 'integer',
    example: 7,
    description: 'customs_clearance_files.id',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ccfId?: number;
}
