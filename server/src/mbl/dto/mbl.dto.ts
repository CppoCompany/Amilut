import { ApiProperty } from '@nestjs/swagger';
import { PaymentTerms } from '../../orders/orders.enums';
import { MblShippingType, SeaMethod } from '../mbl.enums';
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

  @ApiProperty({ type: 'string', nullable: true, example: 'GLOBAL CONSOLIDATION LTD.' })
  shipperName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  shipperAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'TO ORDER OF MAERSK LINE (As per House B/L)' })
  consigneeName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  consigneeAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'EREZ LOGISTICS LTD.' })
  notifyPartyName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  notifyPartyAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'MSKU1234567' })
  containerNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'TCLU1234567' })
  containerSealNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'CONSOLIDATED CARGO' })
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

  @ApiProperty({ type: 'string', format: 'date', nullable: true, example: '2026-09-20' })
  dateOfIssue!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'MAERSK LINE' })
  carrierName!: string | null;

  /** Only non-empty for `seaMethod = 'groupage_fcl'`. */
  @ApiProperty({ type: () => MblContainerDto, isArray: true })
  containers!: MblContainerDto[];

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  updatedAt!: string;
}
