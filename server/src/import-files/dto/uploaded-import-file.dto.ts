import { ApiProperty } from '@nestjs/swagger';
import { ImportDocumentType } from '../import-files.enums';

/**
 * One file stored by `POST /api/import-files/:accountNumber`: written to disk
 * and recorded as a row in `import_account_files`.
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
}
