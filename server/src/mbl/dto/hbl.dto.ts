import { ApiProperty } from '@nestjs/swagger';

/** One order summary embedded in `HblDto.orders`. */
export class HblOrderSummaryDto {
  @ApiProperty({ type: 'integer', example: 1000 })
  id!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'ACME Ltd.' })
  customerName!: string | null;
}

export class HblDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ type: 'integer', example: 1 })
  mblId!: number;

  /** Set only when the parent MBL's `seaMethod = 'groupage_fcl'`. */
  @ApiProperty({ type: 'integer', nullable: true, example: 1 })
  containerId!: number | null;

  @ApiProperty({ type: 'integer', example: 3 })
  customerId!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'ACME Ltd.' })
  customerName!: string | null;

  /** The "Internal B/L {N}" ordinal within its MBL (1-based, not per customer). */
  @ApiProperty({ type: 'integer', example: 1 })
  sequenceNumber!: number;

  /** System-generated, e.g. "IB-001". */
  @ApiProperty({ type: 'string', nullable: true, example: 'IB-001' })
  iblNumber!: string | null;

  /** Free text — the external house B/L number as issued by the forwarder. */
  @ApiProperty({ type: 'string', nullable: true, example: 'HBL-ERZ-2026-001' })
  hblNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Alpha Tools Co.' })
  shipperName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  shipperAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'אלפא בע"מ' })
  consigneeName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  consigneeAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  notifyPartyName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  notifyPartyAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Hand Tools (assorted)' })
  cargoDescription!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: '120 cartons' })
  quantity!: string | null;

  @ApiProperty({ type: 'number', nullable: true, example: 1850 })
  grossWeightKg!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 8.5 })
  volumeCbm!: number | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'LCL - 3 PARTIES / CY/CFS' })
  remarks!: string | null;

  @ApiProperty({ type: () => HblOrderSummaryDto, isArray: true })
  orders!: HblOrderSummaryDto[];

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  updatedAt!: string;
}
