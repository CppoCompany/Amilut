import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  IMPORT_DOCUMENT_TYPE_FIELD,
  UploadImportFilesDto,
} from './dto/upload-import-files.dto';
import { UploadedImportFileDto } from './dto/uploaded-import-file.dto';
import { ImportFilesService } from './import-files.service';

/** Multipart field name the client must use for every file. */
export const IMPORT_FILES_FIELD = 'files';
/** Upper bounds for one request; multer rejects anything beyond them. */
export const MAX_IMPORT_FILES_PER_UPLOAD = 20;
export const MAX_IMPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Authentication is enforced by the global JwtAuthGuard (APP_GUARD). */
@ApiTags('import-files')
@ApiBearerAuth()
@Controller('import-files')
export class ImportFilesController {
  constructor(private readonly importFiles: ImportFilesService) {}

  /**
   * Stores the uploaded files under `storage/<accountNumber>/` (keeping their
   * names) and records one `import_account_files` row per file, all tagged
   * with the `documentType` text field sent in the same multipart request.
   */
  @Post(':accountNumber')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [IMPORT_DOCUMENT_TYPE_FIELD, IMPORT_FILES_FIELD],
      properties: {
        [IMPORT_DOCUMENT_TYPE_FIELD]: {
          $ref: getSchemaPath('ImportDocumentType'),
        },
        [IMPORT_FILES_FIELD]: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiCreatedResponse({ type: UploadedImportFileDto, isArray: true })
  @ApiBadRequestResponse({
    description:
      'No files, missing or invalid documentType, or an unsafe file name.',
  })
  @ApiNotFoundResponse({
    description: 'No import case (order_account) with this account number.',
  })
  @UseInterceptors(
    FilesInterceptor(IMPORT_FILES_FIELD, MAX_IMPORT_FILES_PER_UPLOAD, {
      limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES },
      // Busboy decodes multipart file names as latin1 by default, which turns
      // Hebrew names into mojibake; browsers send them as UTF-8.
      defParamCharset: 'utf8',
    }),
  )
  uploadMultipleImportFiles(
    @Param('accountNumber', ParseIntPipe) accountNumber: number,
    @Body() body: UploadImportFilesDto,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<UploadedImportFileDto[]> {
    return this.importFiles.uploadMultipleImportFiles(
      accountNumber,
      body.documentType,
      files,
    );
  }
}
