import { ApiProperty } from '@nestjs/swagger';
import { AirMethod } from '../../air/air.enums';
import { PaymentTerms } from '../../orders/orders.enums';
import {
  ShipmentStatus,
  ShipmentStatusSource,
} from '../../status-tracks/status-tracks.enums';
import { MblShippingType, MblStatus, SeaMethod } from '../mbl.enums';
import { FlightLegDto } from './flight-leg.dto';
import { MblContainerDto } from './mbl-container.dto';

export class MblDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ enum: MblShippingType, enumName: 'MblShippingType' })
  shippingType!: MblShippingType;

  @ApiProperty({ enum: SeaMethod, enumName: 'SeaMethod', nullable: true })
  seaMethod!: SeaMethod | null;

  @ApiProperty({ type: 'integer', nullable: true, example: 3 })
  customerId!: number | null;

  /** Joined for display — `null` when `customerId` is `null`. */
  @ApiProperty({ type: 'string', nullable: true, example: 'ACME Ltd.' })
  customerName!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'MBL-987654321' })
  mblNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'BKG-456789' })
  bookingNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'EVER GLORY' })
  vesselName!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: '062W' })
  voyageNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Shanghai, China' })
  portOfLoading!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Haifa, Israel' })
  portOfDischarge!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Haifa, Israel' })
  finalDestination!: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'GLOBAL CONSOLIDATION LTD.',
  })
  shipperName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  shipperAddress!: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'TO ORDER OF MAERSK LINE (As per House B/L)',
  })
  consigneeName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  consigneeAddress!: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'EREZ LOGISTICS LTD.',
  })
  notifyPartyName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  notifyPartyAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'MSKU1234567' })
  containerNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'TCLU1234567' })
  containerSealNumber!: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'CONSOLIDATED CARGO',
  })
  cargoDescription!: string | null;

  @ApiProperty({ type: 'number', nullable: true, example: 5400 })
  grossWeightKg!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 25.5 })
  volumeCbm!: number | null;

  @ApiProperty({ enum: PaymentTerms, enumName: 'PaymentTerms', nullable: true })
  freightTerms!: PaymentTerms | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'CY/CFS' })
  receiptDeliveryType!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'SHANGHAI' })
  placeOfIssue!: string | null;

  @ApiProperty({
    type: 'string',
    format: 'date',
    nullable: true,
    example: '2026-09-20',
  })
  dateOfIssue!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'MAERSK LINE' })
  carrierName!: string | null;

  @ApiProperty({ enum: MblStatus, enumName: 'MblStatus' })
  status!: MblStatus;

  /** The user who opened the case (`mbl.handler_user_id`); `null` for cases created before 018. */
  @ApiProperty({ type: 'integer', nullable: true, example: 7 })
  handlerUserId!: number | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Dana Levi' })
  handlerName!: string | null;

  /** The Customs Clearance File linked to this case, if any
   *  (`customs_clearance_files.shipment_file_id → mbl.id`). `null` until a
   *  CCF has been opened for this case. */
  @ApiProperty({ type: 'integer', nullable: true, example: 7 })
  ccfId!: number | null;

  /** Only non-empty for `seaMethod = 'groupage_fcl'`. */
  @ApiProperty({ type: () => MblContainerDto, isArray: true })
  containers!: MblContainerDto[];

  // ── Air (MAWB) only — `null` / empty on a sea MBL ──────────────────────────
  @ApiProperty({ enum: AirMethod, enumName: 'AirMethod', nullable: true })
  airMethod!: AirMethod | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'HKG' })
  departureAirportCode!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'TLV' })
  destinationAirportCode!: string | null;

  @ApiProperty({ type: 'integer', nullable: true, example: 1 })
  cargoTerminalId!: number | null;

  /** Joined for display (Hebrew name) — `null` when no listed terminal is set. */
  @ApiProperty({ type: 'string', nullable: true, example: 'ממ"ן' })
  cargoTerminalName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  cargoTerminalOther!: string | null;

  @ApiProperty({ type: 'integer', nullable: true, example: 12 })
  pieces!: number | null;

  /** Greater of gross and volumetric weight, rounded per the rule snapshot below. */
  @ApiProperty({ type: 'number', nullable: true, example: 412 })
  calculatedChargeableWeightKg!: number | null;

  /** The chargeable weight on / approved from the AWB. */
  @ApiProperty({ type: 'number', nullable: true, example: 412.5 })
  approvedChargeableWeightKg!: number | null;

  /** True when the approved value differs from the calculated one (a recorded override). */
  @ApiProperty({ example: false })
  chargeableWeightOverridden!: boolean;

  @ApiProperty({ type: 'integer', nullable: true, example: 6000 })
  volumetricDivisor!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 0.5 })
  weightRoundingStepKg!: number | null;

  @ApiProperty({ type: 'string', isArray: true, example: ['PER'] })
  specialHandlingCodes!: string[];

  @ApiProperty({
    enum: ShipmentStatus,
    enumName: 'ShipmentStatus',
    nullable: true,
  })
  shipmentStatus!: ShipmentStatus | null;

  @ApiProperty({
    enum: ShipmentStatusSource,
    enumName: 'ShipmentStatusSource',
    nullable: true,
  })
  shipmentStatusSource!: ShipmentStatusSource | null;

  @ApiProperty({ type: () => FlightLegDto, isArray: true })
  flightLegs!: FlightLegDto[];

  /** Direct shipments only: the hidden house carrying orders / CCF / arrivals. */
  @ApiProperty({ type: 'integer', nullable: true, example: 12 })
  mirrorHblId!: number | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  updatedAt!: string;
}
