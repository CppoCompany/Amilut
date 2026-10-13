import { ApiProperty } from '@nestjs/swagger';
import { PagedResponseBase } from '../../common/paging/paged.dto';
import { LineItemClassificationDto } from './line-item-classification.dto';

/**
 * One classified supplier-invoice line, across every import case — a row of
 * "הסיווגים שלי". `fileId` + `lineIndex` identify the stored line exactly as
 * `InvoiceLineItemDto` does, so the classification screen can address it.
 */
export class ClassificationRowDto {
  @ApiProperty({ type: 'integer', example: 42 })
  fileId!: number;

  /** The order this invoice was filed under, when filed under an order. */
  @ApiProperty({ type: 'integer', nullable: true, example: 1024 })
  orderId!: number | null;

  /** The Customs Clearance File this invoice was filed under, when filed under one. */
  @ApiProperty({ type: 'integer', nullable: true, example: 7 })
  ccfId!: number | null;

  /** "הזמנה 1024" or "תיק עמילות CCF1007" — whichever of orderId/ccfId is set. */
  @ApiProperty({ example: 'הזמנה 1024' })
  contextLabel!: string;

  @ApiProperty({ example: 'invoice-2026-09.pdf' })
  fileName!: string;

  @ApiProperty({ type: 'integer', example: 0 })
  lineIndex!: number;

  @ApiProperty({ example: 'Y8022-140BK' })
  item!: string;

  @ApiProperty({ example: 'Light Fixtures' })
  description!: string;

  @ApiProperty({ type: 'number', nullable: true, example: 15 })
  quantity!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 15.32 })
  price!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 229.8 })
  total!: number | null;

  @ApiProperty({ type: () => LineItemClassificationDto })
  classification!: LineItemClassificationDto;

  /** Hebrew name of `classification.countryId`, when set. */
  @ApiProperty({ type: 'string', nullable: true, example: 'סין' })
  countryName!: string | null;

  /** When the invoice file row was created (upload time). */
  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  createdAt!: string;
}

/** One page of GET /import-files/classifications. */
export class PagedClassificationsDto extends PagedResponseBase {
  @ApiProperty({ type: () => ClassificationRowDto, isArray: true })
  items!: ClassificationRowDto[];
}
