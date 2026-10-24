import { ApiProperty } from '@nestjs/swagger';
import { ArrivalState } from '../../air/air.enums';
import { DocumentStatus } from '../../status-tracks/status-tracks.enums';
import { MblShippingType } from '../mbl.enums';
import { PieceDimensionDto } from './piece-dimension.dto';

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

  /** `null` only for an air HAWB not yet linked to a MAWB. */
  @ApiProperty({ type: 'integer', nullable: true, example: 1 })
  mblId!: number | null;

  /** The master's document number, joined for display. */
  @ApiProperty({ type: 'string', nullable: true, example: '114-12345675' })
  mblNumber!: string | null;

  @ApiProperty({ enum: MblShippingType, enumName: 'MblShippingType' })
  shippingType!: MblShippingType;

  /** True for a Direct MAWB's hidden house — never a real HAWB document. */
  @ApiProperty({ example: false })
  isMasterMirror!: boolean;

  /** Set only when the parent MBL's `seaMethod = 'groupage_fcl'`. */
  @ApiProperty({ type: 'integer', nullable: true, example: 1 })
  containerId!: number | null;

  @ApiProperty({ type: 'integer', example: 3 })
  customerId!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'ACME Ltd.' })
  customerName!: string | null;

  /** The "Internal B/L {N}" ordinal within its MBL (1-based, not per
   *  customer); `null` while an air HAWB has no MAWB. */
  @ApiProperty({ type: 'integer', nullable: true, example: 1 })
  sequenceNumber!: number | null;

  /** System-generated, e.g. "IB-001" — also the internal temporary identifier
   *  of an air HAWB until the agent's real HAWB number arrives. */
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

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'Hand Tools (assorted)',
  })
  cargoDescription!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: '120 cartons' })
  quantity!: string | null;

  @ApiProperty({ type: 'number', nullable: true, example: 1850 })
  grossWeightKg!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 8.5 })
  volumeCbm!: number | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'LCL - 3 PARTIES / CY/CFS',
  })
  remarks!: string | null;

  @ApiProperty({ type: () => HblOrderSummaryDto, isArray: true })
  orders!: HblOrderSummaryDto[];

  // ── Air (HAWB) only — `null` / empty on a sea HBL ──────────────────────────
  @ApiProperty({ type: 'integer', nullable: true, example: 12 })
  pieces!: number | null;

  @ApiProperty({ type: () => PieceDimensionDto, isArray: true })
  pieceDimensions!: PieceDimensionDto[];

  @ApiProperty({ type: 'number', nullable: true, example: 120 })
  calculatedChargeableWeightKg!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 120.5 })
  approvedChargeableWeightKg!: number | null;

  @ApiProperty({ example: false })
  chargeableWeightOverridden!: boolean;

  @ApiProperty({ type: 'integer', nullable: true, example: 6000 })
  volumetricDivisor!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 0.5 })
  weightRoundingStepKg!: number | null;

  @ApiProperty({ type: 'string', isArray: true, example: ['DGR'] })
  specialHandlingCodes!: string[];

  @ApiProperty({
    enum: DocumentStatus,
    enumName: 'DocumentStatus',
    nullable: true,
  })
  documentStatus!: DocumentStatus | null;

  /** Sum of non-voided arrival events. */
  @ApiProperty({ type: 'integer', example: 0 })
  piecesReceived!: number;

  /** Derived from `pieces` vs `piecesReceived`; `null` on a sea HBL. */
  @ApiProperty({ enum: ArrivalState, enumName: 'ArrivalState', nullable: true })
  arrivalState!: ArrivalState | null;

  /** The per-house Customs Clearance File (air), if one was opened. */
  @ApiProperty({ type: 'integer', nullable: true, example: 7 })
  ccfId!: number | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  updatedAt!: string;
}
