import { ApiProperty } from '@nestjs/swagger';

/** One file stored by `POST /api/import-files/:accountNumber`. */
export class UploadedImportFileDto {
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
