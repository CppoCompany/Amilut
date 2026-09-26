import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  StreamableFile,
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
  ApiOkResponse,
  ApiProduces,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import {
  IMPORT_DOCUMENT_TYPE_FIELD,
  UploadImportFilesDto,
} from './dto/upload-import-files.dto';
import { InvoiceLineItemDto } from './dto/invoice-line-item.dto';
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

  /**
   * The files filed under the case, newest first, one per file name — the
   * rows of the filing screen's documents table. Line items are omitted.
   */
  @Get(':accountNumber')
  @ApiOkResponse({ type: UploadedImportFileDto, isArray: true })
  @ApiBadRequestResponse({
    description: 'accountNumber is not a positive integer.',
  })
  @ApiNotFoundResponse({
    description: 'No import case (order_account) with this account number.',
  })
  listImportFiles(
    @Param('accountNumber', ParseIntPipe) accountNumber: number,
  ): Promise<UploadedImportFileDto[]> {
    return this.importFiles.listImportFiles(accountNumber);
  }

  /**
   * Streams the bytes of one filed document so the client can open it. Served
   * with the stored MIME type and an `inline` disposition, so PDFs and images
   * open in the browser; anything else is offered as a download.
   */
  @Get(':accountNumber/files/:fileId')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({
    description: 'The file contents, with Content-Type set to its MIME type.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiBadRequestResponse({
    description: 'accountNumber or fileId is not a positive integer.',
  })
  @ApiNotFoundResponse({
    description:
      'Unknown case, no such file in that case, or the file is missing on disk.',
  })
  async getImportFile(
    @Param('accountNumber', ParseIntPipe) accountNumber: number,
    @Param('fileId', ParseIntPipe) fileId: number,
  ): Promise<StreamableFile> {
    const file = await this.importFiles.getImportFile(accountNumber, fileId);
    return new StreamableFile(createReadStream(file.absolutePath), {
      type: file.mimeType,
      disposition: inlineDisposition(file.name),
      length: file.size,
    });
  }

  /**
   * Goods lines of the supplier invoices filed for the case (newest upload of
   * each file name), concatenated in upload order — for the classification
   * screen. Empty when no supplier invoice has been filed yet.
   */
  @Get(':accountNumber/line-items')
  @ApiOkResponse({ type: InvoiceLineItemDto, isArray: true })
  @ApiBadRequestResponse({
    description: 'accountNumber is not a positive integer.',
  })
  @ApiNotFoundResponse({
    description: 'No import case (order_account) with this account number.',
  })
  getSupplierInvoiceLineItems(
    @Param('accountNumber', ParseIntPipe) accountNumber: number,
  ): Promise<InvoiceLineItemDto[]> {
    return this.importFiles.getSupplierInvoiceLineItems(accountNumber);
  }
}

/**
 * `Content-Disposition` for viewing a file in the browser. File names are
 * mostly Hebrew, which the header's plain `filename` cannot carry, so an
 * RFC 5987 `filename*` holds the real name and `filename` an ASCII fallback.
 */
export function inlineDisposition(fileName: string): string {
  const ascii =
    Array.from(fileName, (c) => {
      const code = c.charCodeAt(0);
      // Printable ASCII only, minus the quote (0x22) and backslash (0x5c) that would break the quoted-string.
      return code >= 0x20 && code <= 0x7e && code !== 0x22 && code !== 0x5c
        ? c
        : '_';
    }).join('') || 'file';
  return `inline; filename="${ascii}"; filename*=UTF-8''${rfc5987(fileName)}`;
}

/** Percent-encodes for an RFC 5987 `ext-value`; `encodeURIComponent` leaves these four characters bare. */
function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}
