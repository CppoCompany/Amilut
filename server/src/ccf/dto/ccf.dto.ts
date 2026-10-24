import { ApiProperty } from '@nestjs/swagger';
import { ClearanceStatus } from '../../status-tracks/status-tracks.enums';
import { CcfStatus } from '../ccf.enums';

export class CcfDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ example: 'CCF1000' })
  fileNumber!: string;

  /** The linked shipping case (`mbl.id`), `null` for a standalone CCF. */
  @ApiProperty({ type: 'integer', nullable: true, example: 42 })
  shipmentFileId!: number | null;

  /** Joined for display — the linked case's MBL number, or for a per-house
   *  (air) CCF its HAWB's MAWB number; `null` when neither exists. */
  @ApiProperty({ type: 'string', nullable: true, example: 'MBL-987654321' })
  shipmentFileMblNumber!: string | null;

  /** Air: the linked house (HAWB, `hbl.id`); `null` for sea / standalone CCFs. */
  @ApiProperty({ type: 'integer', nullable: true, example: 15 })
  hblId!: number | null;

  /** The HAWB number — or its temporary internal id — joined for display. */
  @ApiProperty({ type: 'string', nullable: true, example: 'HAWB-001' })
  hblNumber!: string | null;

  @ApiProperty({ enum: CcfStatus, enumName: 'CcfStatus' })
  status!: CcfStatus;

  /** Clearance status track — set for per-house (air) CCFs only. */
  @ApiProperty({
    enum: ClearanceStatus,
    enumName: 'ClearanceStatus',
    nullable: true,
  })
  clearanceStatus!: ClearanceStatus | null;

  @ApiProperty({ type: 'integer', example: 7 })
  createdBy!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'Dana Levi' })
  createdByName!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  updatedAt!: string;
}
