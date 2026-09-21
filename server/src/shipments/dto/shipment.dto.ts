import { ApiProperty } from '@nestjs/swagger';
import { ShipmentDocumentType } from '../shipments.enums';
import { ShipmentOrderSummaryDto } from './shipment-order-summary.dto';

/** Shipment file ("ניהול תיק") as returned by the API — 1 case → many orders. */
export class ShipmentDto {
  @ApiProperty({ type: 'integer', example: 1000 })
  id!: number;

  @ApiProperty({ type: () => ShipmentOrderSummaryDto, isArray: true })
  orders!: ShipmentOrderSummaryDto[];

  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  updatedAt!: string;

  // ── זיהוי מסמך — Document Type & Number ────────────────────────────────────
  @ApiProperty({ type: 'string', nullable: true, example: 'NEXF123456789' })
  billOfLadingNumber!: string | null;

  @ApiProperty({ enum: ShipmentDocumentType, enumName: 'ShipmentDocumentType', nullable: true })
  documentType!: ShipmentDocumentType | null;

  @ApiProperty({ type: 'string', format: 'date', nullable: true, example: '2026-05-27' })
  blIssueDate!: string | null;

  // ── מוביל — Forwarder ───────────────────────────────────────────────────────
  @ApiProperty({ type: 'string', nullable: true, example: 'MSC Mediterranean Shipping Co.' })
  forwarderName!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'VN624A' })
  voyageFlightNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'MSC NAPOLI' })
  vesselName!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'NAPOLI' })
  portOfLoading!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'HAIFA' })
  portOfDischarge!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: '264768' })
  manifestNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: '12345A22' })
  transactionNumber!: string | null;

  // ── שוגר — Shipper ──────────────────────────────────────────────────────────
  @ApiProperty({ type: 'string', nullable: true, example: 'Shanghai Tech Components Co., Ltd' })
  shipperName!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'אלי ויזל 5' })
  shipperAddress!: string | null;

  // ── נמען — Consignee ────────────────────────────────────────────────────────
  @ApiProperty({ type: 'string', nullable: true, example: 'NexTrade Import Ltd' })
  consigneeName!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'שמעון פרס 11' })
  consigneeAddress!: string | null;

  // ── Notify Party ────────────────────────────────────────────────────────────
  @ApiProperty({ type: 'string', nullable: true, example: 'NexFreight Logistics - Israel' })
  notifyParty!: string | null;

  // ── מטען — Cargo ────────────────────────────────────────────────────────────
  @ApiProperty({
    type: 'string',
    nullable: true,
    example: 'Electronic Components - Motherboards & Power Units',
  })
  cargoDescription!: string | null;

  @ApiProperty({ type: 'integer', nullable: true, example: 120 })
  packageCount!: number | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Cartons' })
  packageUnit!: string | null;

  @ApiProperty({ type: 'number', nullable: true, example: 1850 })
  grossWeightKg!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 1720 })
  netWeightKg!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 9.8 })
  volumeCbm!: number | null;

  // ── מכס — Tariff HS Code ────────────────────────────────────────────────────
  @ApiProperty({ type: 'string', nullable: true, example: '8504' })
  hsCode!: string | null;

  // ── תנאים — Terms (dangerous goods only; Incoterms / Freight Terms live on
  // each associated order — see orders.incoterm / orders.paymentTerms) ─────
  @ApiProperty({ example: false })
  dangerousGoods!: boolean;

  @ApiProperty({ type: 'string', nullable: true, example: 'Class 9' })
  dangerousGoodsImoClass!: string | null;

  // ── מסמכים — Documents (container) ──────────────────────────────────────────
  @ApiProperty({ type: 'string', nullable: true, example: 'MSCU7845123' })
  containerNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: '40HC' })
  containerType!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'SH98765421' })
  containerSealNumber!: string | null;
}
