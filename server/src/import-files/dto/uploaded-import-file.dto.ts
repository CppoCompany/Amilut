import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportDocumentType } from '../import-files.enums';
import { InvoiceLineItemDto } from './invoice-line-item.dto';

/**
 * One file stored by `POST /api/import-files/:accountNumber`: written to disk
 * and recorded as a row in `import_account_files`. For a `SUPPLIER_INVOICE`
 * the goods table is extracted from the file into `lineItems`.
 */
export class UploadedImportFileDto {
  @ApiProperty({
    type: 'integer',
    example: 42,
    description: 'Id of the `import_account_files` row created for this file.',
  })
  id!: number;

  @ApiProperty({
    enum: ImportDocumentType,
    enumName: 'ImportDocumentType',
    description: 'Kind of paperwork this file represents.',
  })
  documentType!: ImportDocumentType;

  @ApiProperty({
    example: 'חשבון ספק.pdf',
    description: 'Original file name, as uploaded.',
  })
  name!: string;

  @ApiProperty({
    type: 'integer',
    example: 870400,
    description: 'Size in bytes.',
  })
  size!: number;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({
    example: '1000/חשבון ספק.pdf',
    description:
      'Path relative to the storage root (`storage/` at the repo root).',
  })
  relativePath!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-22T16:05:18.000Z' })
  uploadedAt!: string;

  @ApiPropertyOptional({
    type: InvoiceLineItemDto,
    isArray: true,
    description:
      'Goods lines extracted from the file. Only present for SUPPLIER_INVOICE; ' +
      'empty when nothing could be extracted (see `extractionError`).',
  })
  lineItems?: InvoiceLineItemDto[];

  @ApiPropertyOptional({
    example: 'No line-item table found',
    description:
      'Why `lineItems` is empty: unreadable file, unsupported type or no table. ' +
      'Absent when extraction succeeded or was not attempted.',
  })
  extractionError?: string;
}
