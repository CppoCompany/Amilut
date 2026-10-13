import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Payload for opening a Customs Clearance File. `shipmentFileId` (an
 * `mbl.id`) is optional — omit it to create a standalone CCF. `fileNumber`
 * and `status` are never accepted from the client: the file number is
 * always server-generated (see `CcfService.create`) and status always
 * starts at `open`.
 */
export class CreateCcfDto {
  @ApiPropertyOptional({ type: 'integer', example: 42 })
  @IsOptional()
  @IsInt()
  @Min(1)
  shipmentFileId?: number;
}
