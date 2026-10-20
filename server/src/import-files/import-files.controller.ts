import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
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
  ApiNoContentResponse,
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
import { PagedClassificationsDto } from './dto/classification-row.dto';
import { ImportFilesContextQuery } from './dto/import-files-context.query';
import { InvoiceLineItemDto } from './dto/invoice-line-item.dto';
import { SaveLineItemClassificationsDto } from './dto/line-item-classification.dto';
import { PagedClassificationsQuery } from './dto/paged-classifications.query';
import { UploadedImportFileDto } from './dto/uploaded-import-file.dto';
import {
  ImportFilesService,
  toImportFilesContext,
} from './import-files.service';

/** Multipart field name the client must use for every file. */
export const IMPORT_FILES_FIELD = 'files';
/** Upper bounds for one request; multer rejects anything beyond them. */
export const MAX_IMPORT_FILES_PER_UPLOAD = 20;
export const MAX_IMPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Every route is scoped by exactly one of `?orderId=` / `?ccfId=` (see
 * `ImportFilesContextQuery`) — never a path param, since "order or CCF,
 * never both" doesn't fit one path segment cleanly. Authentication is
 * enforced by the global JwtAuthGuard (APP_GUARD).
 */
@ApiTags('import-files')
@ApiBearerAuth()
@Controller('import-files')
export class ImportFilesController {
  constructor(private readonly importFiles: ImportFilesService) {}

  /** "הסיווגים שלי": every classified supplier-invoice line across all orders/CCFs, paged/sorted/filtered. */
  @Get('classifications')
  @ApiOkResponse({ type: PagedClassificationsDto })
  listClassifications(
    @Query() query: PagedClassificationsQuery,
  ): Promise<PagedClassificationsDto> {
    return this.importFiles.listClassificationsPaged(query);
  }

  /**
   * Stores the uploaded files under `storage/<order-N|ccf-N>/` (keeping
   * their names) and records one `import_account_files` row per file, all
   * tagged with the `documentType` text field sent in the same multipart
   * request.
   */
  @Post()
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
      'No files, missing or invalid documentType, an unsafe file name, or neither/both of orderId/ccfId given.',
  })
  @ApiNotFoundResponse({
    description: 'No order or customs clearance file with this id.',
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
    @Query() context: ImportFilesContextQuery,
    @Body() body: UploadImportFilesDto,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<UploadedImportFileDto[]> {
    return this.importFiles.uploadMultipleImportFiles(
      toImportFilesContext(context),
      body.documentType,
      files,
    );
  }

  /**
   * The files filed under the order/CCF, newest first, one per file name —
   * the rows of the filing screen's documents table. Line items are omitted.
   */
  @Get()
  @ApiOkResponse({ type: UploadedImportFileDto, isArray: true })
  @ApiBadRequestResponse({
    description: 'Neither/both of orderId/ccfId given.',
  })
  @ApiNotFoundResponse({
    description: 'No order or customs clearance file with this id.',
  })
  listImportFiles(
    @Query() context: ImportFilesContextQuery,
  ): Promise<UploadedImportFileDto[]> {
    return this.importFiles.listImportFiles(toImportFilesContext(context));
  }

  /**
   * Streams the bytes of one filed document so the client can open it. Served
   * with the stored MIME type and an `inline` disposition, so PDFs and images
   * open in the browser; anything else is offered as a download.
   */
  @Get('files/:fileId')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({
    description: 'The file contents, with Content-Type set to its MIME type.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiBadRequestResponse({
    description:
      'fileId is not a positive integer, or neither/both of orderId/ccfId given.',
  })
  @ApiNotFoundResponse({
    description:
      'Unknown order/CCF, no such file in it, or the file is missing on disk.',
  })
  async getImportFile(
    @Param('fileId', ParseIntPipe) fileId: number,
    @Query() context: ImportFilesContextQuery,
  ): Promise<StreamableFile> {
    const file = await this.importFiles.getImportFile(
      toImportFilesContext(context),
      fileId,
    );
    return new StreamableFile(createReadStream(file.absolutePath), {
      type: file.mimeType,
      disposition: inlineDisposition(file.name),
      length: file.size,
    });
  }

  /**
   * Deletes one filed document — every upload of that file name in the
   * order/CCF, and the file on disk.
   */
  @Delete('files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The file was deleted.' })
  @ApiBadRequestResponse({
    description:
      'fileId is not a positive integer, or neither/both of orderId/ccfId given.',
  })
  @ApiNotFoundResponse({
    description: 'Unknown order/CCF, or no such file in it.',
  })
  deleteImportFile(
    @Param('fileId', ParseIntPipe) fileId: number,
    @Query() context: ImportFilesContextQuery,
  ): Promise<void> {
    return this.importFiles.deleteImportFile(
      toImportFilesContext(context),
      fileId,
    );
  }

  /**
   * Goods lines of the supplier invoices filed for the order/CCF (newest
   * upload of each file name), concatenated in upload order — for the
   * classification screen. Empty when no supplier invoice has been filed yet.
   */
  @Get('line-items')
  @ApiOkResponse({ type: InvoiceLineItemDto, isArray: true })
  @ApiBadRequestResponse({
    description: 'Neither/both of orderId/ccfId given.',
  })
  @ApiNotFoundResponse({
    description: 'No order or customs clearance file with this id.',
  })
  getSupplierInvoiceLineItems(
    @Query() context: ImportFilesContextQuery,
  ): Promise<InvoiceLineItemDto[]> {
    return this.importFiles.getSupplierInvoiceLineItems(
      toImportFilesContext(context),
    );
  }

  /**
   * Saves what the classification screen recorded against the order/CCF's
   * supplier invoice lines (trade agreement, classification code, approvals,
   * country) into the stored line items, and returns the refreshed line list.
   */
  @Put('line-items/classification')
  @ApiOkResponse({ type: InvoiceLineItemDto, isArray: true })
  @ApiBadRequestResponse({
    description:
      'Invalid payload, a line index outside its file, an unknown country id, or neither/both of orderId/ccfId given.',
  })
  @ApiNotFoundResponse({
    description: 'Unknown order/CCF, or a fileId that is not a file of it.',
  })
  saveLineItemClassifications(
    @Query() context: ImportFilesContextQuery,
    @Body() body: SaveLineItemClassificationsDto,
  ): Promise<InvoiceLineItemDto[]> {
    return this.importFiles.saveLineItemClassifications(
      toImportFilesContext(context),
      body.items,
    );
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
