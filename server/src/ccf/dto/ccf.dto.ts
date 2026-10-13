import { ApiProperty } from '@nestjs/swagger';
import { CcfStatus } from '../ccf.enums';

export class CcfDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ example: 'CCF1000' })
  fileNumber!: string;

  /** The linked shipping case (`mbl.id`), `null` for a standalone CCF. */
  @ApiProperty({ type: 'integer', nullable: true, example: 42 })
  shipmentFileId!: number | null;

  /** Joined for display — `null` when `shipmentFileId` is `null`. */
  @ApiProperty({ type: 'string', nullable: true, example: 'MBL-987654321' })
  shipmentFileMblNumber!: string | null;

  @ApiProperty({ enum: CcfStatus, enumName: 'CcfStatus' })
  status!: CcfStatus;

  @ApiProperty({ type: 'integer', example: 7 })
  createdBy!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'Dana Levi' })
  createdByName!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  updatedAt!: string;
}
