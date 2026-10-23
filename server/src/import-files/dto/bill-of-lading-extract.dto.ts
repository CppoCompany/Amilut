import { ApiProperty } from '@nestjs/swagger';
import { PaymentTerms } from '../../orders/orders.enums';

/** One container row read from a Master B/L's cargo table. */
export class MblContainerExtractDto {
  @ApiProperty({ type: 'string', nullable: true, example: 'BMOU4512398' })
  containerNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'SL-332211' })
  containerSealNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  cargoDescription!: string | null;

  @ApiProperty({ type: 'number', nullable: true, example: 8950 })
  grossWeightKg!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 32.4 })
  volumeCbm!: number | null;
}

/**
 * The Job (MBL) fields read from a Master Bill of Lading document — or from
 * the master-level boxes a House B/L prints. Every field is `null` when the
 * document does not state it; nothing here is validated against the
 * database, it is a prefill for the Job form.
 */
export class MblDocumentExtractDto {
  @ApiProperty({ type: 'string', nullable: true, example: 'NGB-LCL-2026-7731' })
  mblNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'BKG-CFS-8820' })
  bookingNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'OOCL HONG KONG' })
  vesselName!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: '088E' })
  voyageNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Shanghai, China' })
  portOfLoading!: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'Haifa Port, Israel',
  })
  portOfDischarge!: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'Haifa CFS Terminal',
  })
  finalDestination!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  carrierName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  shipperName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  shipperAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  consigneeName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  consigneeAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  notifyPartyName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  notifyPartyAddress!: string | null;

  @ApiProperty({ enum: PaymentTerms, enumName: 'PaymentTerms', nullable: true })
  freightTerms!: PaymentTerms | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'CFS/CFS' })
  receiptDeliveryType!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  placeOfIssue!: string | null;

  @ApiProperty({ type: 'string', format: 'date', nullable: true })
  dateOfIssue!: string | null;

  /** As printed ("26 PACKAGES") — the MBL form has no field for it, shown as a hint. */
  @ApiProperty({ type: 'string', nullable: true, example: '26 PACKAGES' })
  totalPackages!: string | null;

  /** Document-level totals, used for the single-container fields when the table has none. */
  @ApiProperty({ type: 'number', nullable: true, example: 8950 })
  grossWeightKg!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 32.4 })
  volumeCbm!: number | null;

  /** One per container row found; the first one feeds the single-container fields. */
  @ApiProperty({ type: () => MblContainerExtractDto, isArray: true })
  containers!: MblContainerExtractDto[];
}

/**
 * The File (HBL) fields read from one House Bill of Lading. A multi-page
 * file that holds several house B/Ls yields one of these per house B/L.
 */
export class HblDocumentExtractDto {
  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'HBL-NGB-LCL-2026-7731-01',
  })
  hblNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  shipperName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  shipperAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  consigneeName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  consigneeAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  notifyPartyName!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  notifyPartyAddress!: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  cargoDescription!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: '8 wooden crates' })
  quantity!: string | null;

  @ApiProperty({ type: 'number', nullable: true })
  grossWeightKg!: number | null;

  @ApiProperty({ type: 'number', nullable: true })
  volumeCbm!: number | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'LCL CONSOL / CFS TO CFS',
  })
  remarks!: string | null;

  /** The master-level boxes this house B/L prints (MBL number, vessel, ports,
   *  container…) — the Job's fallback when the order holds no MBL document. */
  @ApiProperty({ type: () => MblDocumentExtractDto })
  master!: MblDocumentExtractDto;
}

/**
 * What `GET /api/import-files/bill-of-lading` found in an order's paperwork:
 * the newest `MASTER_BILL_OF_LADING` upload parsed into Job fields and the
 * newest `BILL_OF_LADING` upload parsed into File fields. A missing document
 * leaves its file name `null`; an unreadable one leaves its error set.
 */
export class BillOfLadingExtractDto {
  @ApiProperty({ type: 'string', nullable: true, example: 'MBL.html' })
  mblFileName!: string | null;

  @ApiProperty({ type: () => MblDocumentExtractDto, nullable: true })
  mbl!: MblDocumentExtractDto | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'Unsupported file type',
  })
  mblError!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'שטר מטען.pdf' })
  hblFileName!: string | null;

  @ApiProperty({ type: () => HblDocumentExtractDto, isArray: true })
  hbls!: HblDocumentExtractDto[];

  @ApiProperty({ type: 'string', nullable: true })
  hblError!: string | null;
}
