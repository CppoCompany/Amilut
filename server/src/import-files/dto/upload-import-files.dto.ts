import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ImportDocumentType } from '../import-files.enums';

/** Multipart text field name carrying the document type. */
export const IMPORT_DOCUMENT_TYPE_FIELD = 'documentType';

/**
 * Text fields of the multipart body of `POST /api/import-files/:accountNumber`.
 * The files themselves travel in the `files` field and are read by multer,
 * not by this DTO. Validated by the global ValidationPipe (`whitelist`,
 * `transform`) once the FilesInterceptor has parsed the multipart form.
 */
export class UploadImportFilesDto {
  @ApiProperty({
    enum: ImportDocumentType,
    enumName: 'ImportDocumentType',
    description: 'Kind of paperwork every file in this request represents.',
  })
  @IsEnum(ImportDocumentType, {
    message: `documentType must be one of: ${Object.values(ImportDocumentType).join(', ')}`,
  })
  documentType!: ImportDocumentType;
}
