import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { PoolClient } from 'pg';
import {
  extractHblDocuments,
  extractMblDocument,
} from './bill-of-lading-extraction/bill-of-lading-extractor';
import {
  DocPage,
  readDocument,
} from './bill-of-lading-extraction/document-model';
import { BillOfLadingExtractDto } from './dto/bill-of-lading-extract.dto';
import { Paged } from '../common/paging/paged.dto';
import {
  orderByClause,
  pageWindow,
  pushDateRange,
  pushTextSearch,
  toPaged,
  WithTotal,
} from '../common/paging/paging.util';
import { DatabaseService } from '../database/database.service';
import { ClassificationRowDto } from './dto/classification-row.dto';
import { ImportFilesContextQuery } from './dto/import-files-context.query';
import { InvoiceLineItemDto } from './dto/invoice-line-item.dto';
import { LineItemClassificationUpdateDto } from './dto/line-item-classification.dto';
import {
  CreateLineItemNoteDto,
  LineItemNoteDto,
} from './dto/line-item-note.dto';
import {
  CLASSIFICATION_SORT_COLUMNS,
  PagedClassificationsQuery,
} from './dto/paged-classifications.query';
import { UploadedImportFileDto } from './dto/uploaded-import-file.dto';
import { ImportDocumentType } from './import-files.enums';
import {
  describeExtractionError,
  InvoiceExtractorService,
} from './invoice-extraction/invoice-extractor.service';
import {
  InvoiceExtractionResult,
  InvoiceLineItem,
} from './invoice-extraction/invoice-line-item';
import {
  LineItemClassification,
  normaliseLineItemClassification,
} from './line-item-classification';

/** Injection token for the absolute directory that holds `<order-N|ccf-N>/<file>`. */
export const IMPORT_FILES_STORAGE_DIR = 'IMPORT_FILES_STORAGE_DIR';

/**
 * Default storage root: `<repo root>/storage`. This file lives at
 * `server/src/import-files/` (ts-node, jest) or `server/dist/import-files/`
 * (nest build), so three levels up is the repo root in both cases.
 * Override with the `STORAGE_DIR` env var.
 */
export function defaultStorageDir(): string {
  return (
    process.env.STORAGE_DIR ??
    path.resolve(__dirname, '..', '..', '..', 'storage')
  );
}

/** Minimal shape of a multer file we rely on (memory storage). */
export interface UploadedFileInput {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

/**
 * Contents of the `import_account_files.data` JSONB column, one per file.
 * `lineItems` (and `extractionError` when extraction did not succeed) are
 * only present for `SUPPLIER_INVOICE` uploads.
 */
export interface ImportAccountFileData {
  documentType: ImportDocumentType;
  name: string;
  size: number;
  mimeType: string;
  relativePath: string;
  uploadedAt: string;
  lineItems?: InvoiceLineItem[];
  extractionError?: string;
}

/**
 * A file belongs to exactly one of an Order or a Customs Clearance File —
 * never both, never neither (enforced in the DB by
 * `import_account_files_exactly_one_context_chk`, migration 021). Built
 * from the validated query via {@link toImportFilesContext}.
 */
export type ImportFilesContext =
  | { kind: 'order'; id: number }
  | { kind: 'ccf'; id: number };

/** Validates "exactly one of orderId/ccfId" — not expressible via plain class-validator decorators. */
export function toImportFilesContext(
  query: ImportFilesContextQuery,
): ImportFilesContext {
  const hasOrder = query.orderId !== undefined;
  const hasCcf = query.ccfId !== undefined;
  if (hasOrder === hasCcf) {
    throw new BadRequestException(
      'Exactly one of orderId or ccfId is required',
    );
  }
  return hasOrder
    ? { kind: 'order', id: query.orderId as number }
    : { kind: 'ccf', id: query.ccfId as number };
}

function contextColumn(context: ImportFilesContext): 'order_id' | 'ccf_id' {
  return context.kind === 'order' ? 'order_id' : 'ccf_id';
}

/** Storage sub-directory name — `order-${id}`/`ccf-${id}`, not the bare id:
 *  an order id and a ccf id are independent spaces and could otherwise
 *  collide on the same folder. */
function contextDirName(context: ImportFilesContext): string {
  return context.kind === 'order' ? `order-${context.id}` : `ccf-${context.id}`;
}

export const SELECT_ORDER_EXISTS_SQL = 'SELECT id FROM orders WHERE id = $1';
export const SELECT_CCF_EXISTS_SQL =
  'SELECT id FROM customs_clearance_files WHERE id = $1';

function existsSql(context: ImportFilesContext): string {
  return context.kind === 'order'
    ? SELECT_ORDER_EXISTS_SQL
    : SELECT_CCF_EXISTS_SQL;
}

export const INSERT_IMPORT_ACCOUNT_FILE_SQL = `INSERT INTO import_account_files (order_id, ccf_id, data)
   VALUES ($1, $2, $3::jsonb)
   RETURNING id`;

/**
 * The current (newest by id) `SUPPLIER_INVOICE` row per file name for one
 * context, oldest upload first. Re-uploading a file adds a new row, so the
 * highest id per name is the one whose line items are live.
 */
export function selectLatestSupplierInvoiceRowsSql(
  context: ImportFilesContext,
): string {
  const col = contextColumn(context);
  return `SELECT id, data FROM (
     SELECT DISTINCT ON (data->>'name') id, data
       FROM import_account_files
      WHERE ${col} = $1 AND data->>'documentType' = $2
      ORDER BY data->>'name', id DESC
   ) latest
   ORDER BY (data->>'uploadedAt'), (data->>'name')`;
}

/**
 * The current (newest by id) row per file name for one context, newest
 * upload first — what the filing screen's documents table shows.
 * Supplier-invoice line items are stripped: the list only needs the file
 * descriptor.
 */
export function selectLatestFilesSql(context: ImportFilesContext): string {
  const col = contextColumn(context);
  return `SELECT id, data - 'lineItems' - 'extractionError' AS data FROM (
     SELECT DISTINCT ON (data->>'name') id, data
       FROM import_account_files
      WHERE ${col} = $1
      ORDER BY data->>'name', id DESC
   ) latest
   ORDER BY (data->>'uploadedAt') DESC, id DESC`;
}

/** One file row by id, scoped to its context so a file can never be read through another order/CCF. */
export function selectFileByIdSql(
  context: ImportFilesContext,
  forUpdate = false,
): string {
  const col = contextColumn(context);
  return `SELECT id, data FROM import_account_files
   WHERE id = $1 AND ${col} = $2${forUpdate ? '\n   FOR UPDATE' : ''}`;
}

/** Replaces the whole JSON descriptor of one file row. */
export function updateFileDataSql(context: ImportFilesContext): string {
  const col = contextColumn(context);
  return `UPDATE import_account_files
   SET data = $2::jsonb
   WHERE id = $1 AND ${col} = $3`;
}

/**
 * Every row of one file name in one context — the current upload and the
 * older ones it superseded (they share the file on disk). Deleting only the
 * newest would let an older upload of the same name reappear in the list.
 */
export function deleteFilesByNameSql(context: ImportFilesContext): string {
  const col = contextColumn(context);
  return `DELETE FROM import_account_files
   WHERE ${col} = $1 AND data->>'name' = $2`;
}

/** Every note on the lines of the context's files, oldest first, with its author's name. */
export function selectLineItemNotesSql(context: ImportFilesContext): string {
  const col = contextColumn(context);
  return `SELECT n.id, n.file_id, n.line_index, n.body, u.name AS created_by_name, n.created_at
     FROM line_item_notes n
     JOIN import_account_files f ON f.id = n.file_id
     LEFT JOIN users u ON u.id = n.created_by
    WHERE f.${col} = $1
    ORDER BY n.created_at, n.id`;
}

export const INSERT_LINE_ITEM_NOTE_SQL = `WITH n AS (
       INSERT INTO line_item_notes (file_id, line_index, body, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, file_id, line_index, body, created_by, created_at
     )
   SELECT n.id, n.file_id, n.line_index, n.body, u.name AS created_by_name, n.created_at
     FROM n
     LEFT JOIN users u ON u.id = n.created_by`;

/** Which of the given country ids exist. */
export const SELECT_EXISTING_COUNTRY_IDS_SQL =
  'SELECT id FROM countries WHERE id = ANY($1::int[])';

/**
 * Every classified supplier-invoice line across all orders/CCFs, one row per
 * line ("הסיווגים שלי"). Only the newest row per (context, file name)
 * counts — a re-upload supersedes the older file exactly as on the
 * classification screen. A line is "classified" once the screen saved a
 * `classification` object onto it. `count(*) OVER()` carries the unpaged
 * total for the pager.
 */
export const SELECT_CLASSIFIED_LINES_SQL = `SELECT count(*) OVER() AS total,
          f.id AS file_id,
          f.order_id,
          f.ccf_id,
          ccf.file_number AS ccf_file_number,
          f.data->>'name' AS file_name,
          (li.idx - 1)::int AS line_index,
          li.item->>'item' AS item,
          li.item->>'description' AS description,
          li.item->'quantity' AS quantity,
          li.item->'price' AS price,
          li.item->'total' AS total_amount,
          li.item->'classification' AS classification,
          co.name AS country_name,
          f.created_at
     FROM import_account_files f
     LEFT JOIN customs_clearance_files ccf ON ccf.id = f.ccf_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.data->'lineItems', '[]'::jsonb))
          WITH ORDINALITY AS li(item, idx)
     LEFT JOIN countries co
       ON jsonb_typeof(li.item->'classification'->'countryId') = 'number'
      AND co.id = (li.item->'classification'->>'countryId')::int`;

/** Predicates every classified-line row must satisfy (see SELECT_CLASSIFIED_LINES_SQL).
 *  `IS NOT DISTINCT FROM` (NULL-safe equality) is needed since the dedup key
 *  is now two nullable columns, exactly one of which is ever set per row. */
export const CLASSIFIED_LINES_BASE_WHERE = [
  `jsonb_typeof(li.item->'classification') = 'object'`,
  `f.id = (SELECT max(f2.id) FROM import_account_files f2
            WHERE f2.order_id IS NOT DISTINCT FROM f.order_id
              AND f2.ccf_id   IS NOT DISTINCT FROM f.ccf_id
              AND f2.data->>'name' = f.data->>'name')`,
] as const;

/** ILIKE targets of the free-text search on GET /import-files/classifications. */
export const CLASSIFIED_LINES_SEARCH_EXPRESSIONS = [
  `li.item->>'item'`,
  `li.item->>'description'`,
  `li.item->'classification'->>'classificationCode'`,
  `f.data->>'name'`,
] as const;

/** Row shape of SELECT_CLASSIFIED_LINES_SQL. */
interface ClassifiedLineRow extends WithTotal {
  file_id: number;
  order_id: number | null;
  ccf_id: number | null;
  ccf_file_number: string | null;
  file_name: string | null;
  line_index: number;
  item: string | null;
  description: string | null;
  quantity: unknown;
  price: unknown;
  total_amount: unknown;
  classification: unknown;
  country_name: string | null;
  created_at: Date | string;
}

/** "הזמנה 1024" or "תיק עמילות CCF1007" — shared with DashboardService. */
export function describeImportFilesContext(
  orderId: number | null,
  ccfId: number | null,
  ccfFileNumber: string | null,
): string {
  return orderId !== null
    ? `הזמנה ${orderId}`
    : `תיק עמילות ${ccfFileNumber ?? ccfId}`;
}

/** A stored file resolved to its location on disk, ready to be streamed to the client. */
export interface StoredImportFile {
  /** Absolute path inside the storage root. */
  absolutePath: string;
  name: string;
  mimeType: string;
  size: number;
}

const PG_FOREIGN_KEY_VIOLATION = '23503';

/**
 * Persists uploaded import paperwork: the bytes go to disk under
 * `<storage root>/<order-N|ccf-N>/` (original names kept) and one
 * `import_account_files` row per file records its descriptor as JSONB.
 * Supplier invoices additionally get their goods table extracted into the
 * same JSON (`lineItems`); extraction failures never fail the upload.
 * The rows are written in a single transaction so a failed insert leaves
 * no partial batch behind.
 */
@Injectable()
export class ImportFilesService {
  constructor(
    @Inject(IMPORT_FILES_STORAGE_DIR) private readonly storageDir: string,
    private readonly db: DatabaseService,
    private readonly invoiceExtractor: InvoiceExtractorService,
  ) {}

  /**
   * Saves every file in `files` to `<storageDir>/<order-N|ccf-N>/<originalname>`
   * and inserts one `import_account_files` row per file tagged with
   * `documentType`. A file with the same name for the same context is
   * overwritten on disk (a new row is still added).
   *
   * @throws BadRequestException — unknown documentType, no files, or an
   *   unsafe file name (nothing is written in that case).
   * @throws NotFoundException — the order/CCF does not exist.
   */
  async uploadMultipleImportFiles(
    context: ImportFilesContext,
    documentType: ImportDocumentType,
    files: UploadedFileInput[],
  ): Promise<UploadedImportFileDto[]> {
    if (!isImportDocumentType(documentType)) {
      throw new BadRequestException(
        `documentType must be one of: ${Object.values(ImportDocumentType).join(', ')}`,
      );
    }
    if (!files?.length) {
      throw new BadRequestException(
        'No files were uploaded (expected multipart field "files")',
      );
    }

    // Validate every name before touching the disk so a bad file rejects the whole batch.
    const named = files.map((file) => ({
      file,
      name: safeFileName(file.originalname),
    }));

    // Parse invoices before opening the transaction so it stays short.
    const extractions = new Map<UploadedFileInput, InvoiceExtractionResult>();
    if (documentType === ImportDocumentType.SUPPLIER_INVOICE) {
      for (const { file } of named) {
        extractions.set(file, await this.extractLineItems(file));
      }
    }

    const dirName = contextDirName(context);
    const contextDir = path.join(this.storageDir, dirName);

    return this.db.transaction(async (client) => {
      // Fail before writing anything to disk when the order/CCF does not exist.
      await assertContextExists(client, context);
      await mkdir(contextDir, { recursive: true });

      const uploadedAt = new Date().toISOString();
      const results: UploadedImportFileDto[] = [];
      for (const { file, name } of named) {
        await writeFile(path.join(contextDir, name), file.buffer);
        const data: ImportAccountFileData = {
          documentType,
          name,
          size: file.size,
          mimeType: file.mimetype,
          relativePath: `${dirName}/${name}`,
          uploadedAt,
          ...extractions.get(file),
        };
        const id = await insertFileRow(client, context, data);
        const { lineItems, ...descriptor } = data;
        results.push({
          id,
          ...descriptor,
          ...(lineItems
            ? {
                lineItems: lineItems.map((item, lineIndex) =>
                  normaliseLineItem(item, id, lineIndex),
                ),
              }
            : {}),
        });
      }
      return results;
    });
  }

  /**
   * Line items of every supplier invoice filed for the order/CCF, in upload
   * order, using only the newest row of each file name (re-uploads
   * supersede). Items are normalised so every field is present (`''` / `null`).
   *
   * @returns `[]` when none has been filed yet (or none had a table).
   * @throws NotFoundException — the order/CCF does not exist.
   */
  async getSupplierInvoiceLineItems(
    context: ImportFilesContext,
  ): Promise<InvoiceLineItemDto[]> {
    await this.assertContextExists(context);

    const rows = await this.db.query<{
      id: number;
      data: Partial<ImportAccountFileData>;
    }>(selectLatestSupplierInvoiceRowsSql(context), [
      context.id,
      ImportDocumentType.SUPPLIER_INVOICE,
    ]);
    return rows.flatMap(({ id, data }) =>
      Array.isArray(data?.lineItems)
        ? data.lineItems.map((item, lineIndex) =>
            normaliseLineItem(item, id, lineIndex),
          )
        : [],
    );
  }

  /**
   * Records the classification screen's columns (trade agreement,
   * classification code, approvals, country) against the stored supplier
   * invoice lines they belong to, then returns the refreshed line list.
   * Each item names its line by `fileId` + `lineIndex` as handed out by
   * {@link getSupplierInvoiceLineItems}. All updates run in one transaction:
   * either every line is written or none is.
   *
   * @throws BadRequestException — a line index outside the file's items, or
   *   an unknown country id.
   * @throws NotFoundException — unknown order/CCF, or a `fileId` that is not
   *   a file of that order/CCF.
   */
  async saveLineItemClassifications(
    context: ImportFilesContext,
    items: LineItemClassificationUpdateDto[],
  ): Promise<InvoiceLineItemDto[]> {
    if (items.length > 0) {
      await this.db.transaction(async (client) => {
        await assertContextExists(client, context);
        await assertCountriesExist(client, items);

        const byFile = new Map<number, LineItemClassificationUpdateDto[]>();
        for (const item of items) {
          byFile.set(item.fileId, [...(byFile.get(item.fileId) ?? []), item]);
        }

        for (const [fileId, updates] of byFile) {
          const found = await client.query<{
            id: number;
            data: Partial<ImportAccountFileData>;
          }>(selectFileByIdSql(context, true), [fileId, context.id]);
          const row = found.rows[0];
          if (!row) {
            throw fileNotFound(context, fileId);
          }
          const lineItems = Array.isArray(row.data.lineItems)
            ? [...row.data.lineItems]
            : [];
          for (const update of updates) {
            const current = lineItems[update.lineIndex] as
              | InvoiceLineItem
              | null
              | undefined;
            if (update.lineIndex >= lineItems.length || current == null) {
              throw new BadRequestException(
                `File ${fileId} has no line item at index ${update.lineIndex}`,
              );
            }
            lineItems[update.lineIndex] = {
              ...current,
              classification: toClassification(update),
            };
          }
          await client.query(updateFileDataSql(context), [
            fileId,
            JSON.stringify({ ...row.data, lineItems }),
            context.id,
          ]);
        }
      });
    }

    return this.getSupplierInvoiceLineItems(context);
  }

  /**
   * Every note written on the classification screen against the lines of
   * the order/CCF's files, oldest first — the client groups them per line.
   *
   * @throws NotFoundException — the order/CCF does not exist.
   */
  async listLineItemNotes(
    context: ImportFilesContext,
  ): Promise<LineItemNoteDto[]> {
    await this.assertContextExists(context);
    const rows = await this.db.query<LineItemNoteRow>(
      selectLineItemNotesSql(context),
      [context.id],
    );
    return rows.map(toLineItemNote);
  }

  /**
   * Adds a note to one supplier-invoice line, attributed to `userId`.
   *
   * @throws BadRequestException — a line index outside the file's items.
   * @throws NotFoundException — unknown order/CCF, or a `fileId` that is not
   *   a file of that order/CCF.
   */
  async addLineItemNote(
    context: ImportFilesContext,
    note: CreateLineItemNoteDto,
    userId: number,
  ): Promise<LineItemNoteDto> {
    await this.assertContextExists(context);
    const row = await this.db.queryOne<{
      id: number;
      data: Partial<ImportAccountFileData>;
    }>(selectFileByIdSql(context), [note.fileId, context.id]);
    if (!row) {
      throw fileNotFound(context, note.fileId);
    }
    const lineItems = Array.isArray(row.data.lineItems)
      ? row.data.lineItems
      : [];
    if (note.lineIndex >= lineItems.length) {
      throw new BadRequestException(
        `File ${note.fileId} has no line item at index ${note.lineIndex}`,
      );
    }
    const inserted = await this.db.queryOne<LineItemNoteRow>(
      INSERT_LINE_ITEM_NOTE_SQL,
      [note.fileId, note.lineIndex, note.body, userId],
    );
    if (!inserted) {
      throw new BadRequestException('The note was not recorded');
    }
    return toLineItemNote(inserted);
  }

  /**
   * One page of classified supplier-invoice lines across every order/CCF —
   * the data source of "הסיווגים שלי". Unscoped by default: free-text search
   * covers item code, description, classification code and file name;
   * `orderId`/`ccfId` each independently narrow to one context; `from`/`to`
   * bound the upload date; `sort` is whitelisted.
   */
  async listClassificationsPaged(
    query: PagedClassificationsQuery,
  ): Promise<Paged<ClassificationRowDto>> {
    const where: string[] = [...CLASSIFIED_LINES_BASE_WHERE];
    const params: unknown[] = [];

    pushTextSearch(where, params, CLASSIFIED_LINES_SEARCH_EXPRESSIONS, query.q);
    if (query.orderId !== undefined) {
      params.push(query.orderId);
      where.push(`f.order_id = $${params.length}`);
    }
    if (query.ccfId !== undefined) {
      params.push(query.ccfId);
      where.push(`f.ccf_id = $${params.length}`);
    }
    pushDateRange(where, params, 'f.created_at', query.from, query.to);

    const window = pageWindow(query);
    params.push(window.limit);
    const limitIdx = params.length;
    params.push(window.offset);
    const offsetIdx = params.length;

    const rows = await this.db.query<ClassifiedLineRow>(
      `${SELECT_CLASSIFIED_LINES_SQL}
    WHERE ${where.join(' AND ')}
    ${orderByClause(CLASSIFICATION_SORT_COLUMNS, query.sort, 'createdAt', query.dir, 'desc', 'f.id DESC, li.idx ASC')}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );
    return toPaged(rows, window, toClassificationRow);
  }

  /**
   * The files filed under the order/CCF, newest upload first, one entry per
   * file name (a re-upload replaces the older row in the list). Line items
   * are not included.
   *
   * @throws NotFoundException — the order/CCF does not exist.
   */
  async listImportFiles(
    context: ImportFilesContext,
  ): Promise<UploadedImportFileDto[]> {
    await this.assertContextExists(context);

    const rows = await this.db.query<{
      id: number;
      data: Omit<ImportAccountFileData, 'lineItems' | 'extractionError'>;
    }>(selectLatestFilesSql(context), [context.id]);
    return rows.map(({ id, data }) => ({ id, ...data }));
  }

  /**
   * Reads the Job / File fields out of the order/CCF's bill-of-lading
   * paperwork: the newest `MASTER_BILL_OF_LADING` upload becomes Job (MBL)
   * fields, the newest `BILL_OF_LADING` upload becomes File (HBL) fields —
   * one per house B/L the file holds. A missing document leaves its part
   * empty; one that cannot be read (a scan, an unsupported type) leaves its
   * error set. A document problem never fails the request.
   *
   * @throws NotFoundException — the order/CCF does not exist.
   */
  async getBillOfLadingExtract(
    context: ImportFilesContext,
  ): Promise<BillOfLadingExtractDto> {
    const files = await this.listImportFiles(context); // newest first
    const mblFile =
      files.find(
        (file) =>
          file.documentType === ImportDocumentType.MASTER_BILL_OF_LADING,
      ) ?? null;
    const hblFile =
      files.find(
        (file) => file.documentType === ImportDocumentType.BILL_OF_LADING,
      ) ?? null;

    const result: BillOfLadingExtractDto = {
      mblFileName: mblFile?.name ?? null,
      mbl: null,
      mblError: null,
      hblFileName: hblFile?.name ?? null,
      hbls: [],
      hblError: null,
    };
    if (mblFile) {
      try {
        result.mbl = extractMblDocument(
          await this.readDocumentPages(context, mblFile.id),
        );
      } catch (err) {
        result.mblError = describeExtractionError(err);
      }
    }
    if (hblFile) {
      try {
        result.hbls = extractHblDocuments(
          await this.readDocumentPages(context, hblFile.id),
        );
      } catch (err) {
        result.hblError = describeExtractionError(err);
      }
    }
    return result;
  }

  /** The stored file's text, as pages of cells, for the bill-of-lading extractor. */
  private async readDocumentPages(
    context: ImportFilesContext,
    fileId: number,
  ): Promise<DocPage[]> {
    const stored = await this.getImportFile(context, fileId);
    const buffer = await readFile(stored.absolutePath);
    return readDocument(buffer, stored.name, stored.mimeType);
  }

  /**
   * Locates file `fileId` of the order/CCF on disk so the controller can
   * stream it. The path recorded in the row is re-validated against the
   * storage root.
   *
   * @throws BadRequestException — bad file id.
   * @throws NotFoundException — unknown order/CCF, no such file in it, or
   *   the bytes are gone from disk.
   */
  async getImportFile(
    context: ImportFilesContext,
    fileId: number,
  ): Promise<StoredImportFile> {
    await this.assertContextExists(context);
    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new BadRequestException('fileId must be a positive integer');
    }

    const row = await this.db.queryOne<{
      id: number;
      data: Partial<ImportAccountFileData>;
    }>(selectFileByIdSql(context), [fileId, context.id]);
    if (!row) {
      throw fileNotFound(context, fileId);
    }

    const { name, mimeType, relativePath } = row.data;
    if (typeof relativePath !== 'string' || typeof name !== 'string') {
      throw fileNotFound(context, fileId);
    }
    const absolutePath = resolveInsideStorage(this.storageDir, relativePath);
    if (absolutePath === null) {
      throw fileNotFound(context, fileId);
    }

    let onDisk;
    try {
      onDisk = await stat(absolutePath);
    } catch {
      throw fileNotFound(context, fileId);
    }
    if (!onDisk.isFile()) {
      throw fileNotFound(context, fileId);
    }

    return {
      absolutePath,
      name,
      mimeType:
        typeof mimeType === 'string' && mimeType !== ''
          ? mimeType
          : 'application/octet-stream',
      size: onDisk.size,
    };
  }

  /**
   * Deletes file `fileId` of the order/CCF: every row of that file name in
   * the context (re-uploads included, so no older version resurfaces) and,
   * once that is committed, the file on disk. Supplier-invoice line items
   * and their classifications live in those rows and go with them.
   *
   * @throws BadRequestException — bad file id.
   * @throws NotFoundException — unknown order/CCF or no such file in it.
   */
  async deleteImportFile(
    context: ImportFilesContext,
    fileId: number,
  ): Promise<void> {
    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new BadRequestException('fileId must be a positive integer');
    }

    const relativePath = await this.db.transaction(async (client) => {
      await assertContextExists(client, context);
      const found = await client.query<{
        id: number;
        data: Partial<ImportAccountFileData>;
      }>(selectFileByIdSql(context, true), [fileId, context.id]);
      const row = found.rows[0];
      if (!row || typeof row.data.name !== 'string') {
        throw fileNotFound(context, fileId);
      }
      await client.query(deleteFilesByNameSql(context), [
        context.id,
        row.data.name,
      ]);
      return row.data.relativePath;
    });

    // Best-effort: the rows are gone, so a leftover file is unreachable anyway.
    const absolutePath =
      typeof relativePath === 'string'
        ? resolveInsideStorage(this.storageDir, relativePath)
        : null;
    if (absolutePath !== null) {
      await rm(absolutePath, { force: true }).catch(() => undefined);
    }
  }

  /** Checks the order/CCF exists (outside a transaction). */
  private async assertContextExists(
    context: ImportFilesContext,
  ): Promise<void> {
    const found = await this.db.queryOne<{ id: number }>(existsSql(context), [
      context.id,
    ]);
    if (!found) {
      throw contextNotFound(context);
    }
  }

  /**
   * Runs the invoice extractor over one file. The extractor already reports
   * problems as `extractionError`; this guards against it throwing outright
   * so a broken file can never fail the upload.
   */
  private async extractLineItems(
    file: UploadedFileInput,
  ): Promise<InvoiceExtractionResult> {
    try {
      return await this.invoiceExtractor.extract(file);
    } catch (err) {
      return { lineItems: [], extractionError: describeExtractionError(err) };
    }
  }
}

function isImportDocumentType(value: unknown): value is ImportDocumentType {
  return (
    typeof value === 'string' &&
    (Object.values(ImportDocumentType) as string[]).includes(value)
  );
}

async function assertContextExists(
  client: PoolClient,
  context: ImportFilesContext,
): Promise<void> {
  const found = await client.query<{ id: number }>(existsSql(context), [
    context.id,
  ]);
  if (found.rows.length === 0) {
    throw contextNotFound(context);
  }
}

/** Inserts one `import_account_files` row and returns its id. */
async function insertFileRow(
  client: PoolClient,
  context: ImportFilesContext,
  data: ImportAccountFileData,
): Promise<number> {
  let inserted;
  try {
    inserted = await client.query<{ id: number }>(
      INSERT_IMPORT_ACCOUNT_FILE_SQL,
      [
        context.kind === 'order' ? context.id : null,
        context.kind === 'ccf' ? context.id : null,
        JSON.stringify(data),
      ],
    );
  } catch (err) {
    throw translateWriteError(err, context);
  }
  const id = inserted.rows[0]?.id;
  if (id === undefined) {
    throw new BadRequestException(`File "${data.name}" was not recorded`);
  }
  return id;
}

/** The FK on order_id/ccf_id can still fire if the order/CCF is deleted mid-request. */
function translateWriteError(
  err: unknown,
  context: ImportFilesContext,
): unknown {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === PG_FOREIGN_KEY_VIOLATION) {
    return contextNotFound(context);
  }
  return err;
}

/** Fills in fields a stored line item may lack so the client always gets the full shape. */
function normaliseLineItem(
  raw: Partial<InvoiceLineItem> | null,
  fileId: number,
  lineIndex: number,
): InvoiceLineItemDto {
  const item = raw ?? {};
  return {
    fileId,
    lineIndex,
    item: typeof item.item === 'string' ? item.item : '',
    description: typeof item.description === 'string' ? item.description : '',
    quantity: numberOrNull(item.quantity),
    price: numberOrNull(item.price),
    total: numberOrNull(item.total),
    classification: normaliseLineItemClassification(item.classification),
  };
}

/** Maps one SELECT_CLASSIFIED_LINES_SQL row to its DTO (JSON-typed cells are normalised like line items). */
function toClassificationRow(row: ClassifiedLineRow): ClassificationRowDto {
  return {
    fileId: row.file_id,
    orderId: row.order_id,
    ccfId: row.ccf_id,
    contextLabel: describeImportFilesContext(
      row.order_id,
      row.ccf_id,
      row.ccf_file_number,
    ),
    fileName: row.file_name ?? '',
    lineIndex: row.line_index,
    item: row.item ?? '',
    description: row.description ?? '',
    quantity: numberOrNull(row.quantity),
    price: numberOrNull(row.price),
    total: numberOrNull(row.total_amount),
    classification: normaliseLineItemClassification(row.classification),
    countryName: row.country_name ?? null,
    createdAt: (row.created_at instanceof Date
      ? row.created_at
      : new Date(row.created_at)
    ).toISOString(),
  };
}

interface LineItemNoteRow {
  id: number;
  file_id: number;
  line_index: number;
  body: string;
  created_by_name: string | null;
  created_at: Date | string;
}

function toLineItemNote(row: LineItemNoteRow): LineItemNoteDto {
  return {
    id: row.id,
    fileId: row.file_id,
    lineIndex: row.line_index,
    body: row.body,
    createdByName: row.created_by_name ?? null,
    createdAt: (row.created_at instanceof Date
      ? row.created_at
      : new Date(row.created_at)
    ).toISOString(),
  };
}

/** Keeps only the classification fields of an update (drops fileId / lineIndex) and de-duplicates approvals. */
function toClassification(
  update: LineItemClassificationUpdateDto,
): LineItemClassification {
  return {
    tradeAgreement: update.tradeAgreement ?? null,
    classificationCode: update.classificationCode.trim(),
    approvals: Array.from(new Set(update.approvals)),
    licenses: Array.from(new Set(update.licenses)),
    countryId: update.countryId ?? null,
  };
}

/** Rejects the batch when any referenced `countryId` is not a `countries` row. */
async function assertCountriesExist(
  client: PoolClient,
  items: LineItemClassificationUpdateDto[],
): Promise<void> {
  const wanted = Array.from(
    new Set(
      items
        .map((item) => item.countryId)
        .filter((id): id is number => typeof id === 'number'),
    ),
  );
  if (wanted.length === 0) return;
  const found = await client.query<{ id: number }>(
    SELECT_EXISTING_COUNTRY_IDS_SQL,
    [wanted],
  );
  const existing = new Set(found.rows.map((row) => row.id));
  const missing = wanted.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    throw new BadRequestException(
      `Unknown country id(s): ${missing.join(', ')}`,
    );
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function contextNotFound(context: ImportFilesContext): NotFoundException {
  return context.kind === 'order'
    ? new NotFoundException(`Order ${context.id} not found`)
    : new NotFoundException(`Customs clearance file ${context.id} not found`);
}

function fileNotFound(
  context: ImportFilesContext,
  fileId: number,
): NotFoundException {
  const owner =
    context.kind === 'order'
      ? `order ${context.id}`
      : `customs clearance file ${context.id}`;
  return new NotFoundException(`File ${fileId} of ${owner} not found`);
}

/**
 * Joins `relativePath` onto `storageDir` and returns the absolute path, or
 * `null` when the result would land outside the storage root (a tampered or
 * malformed row must never let a request read an arbitrary file).
 */
export function resolveInsideStorage(
  storageDir: string,
  relativePath: string,
): string | null {
  const root = path.resolve(storageDir);
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return absolute;
}

/**
 * Keeps the original file name but refuses anything that could escape the
 * storage folder (path separators, `..`, empty names, NUL bytes).
 */
export function safeFileName(originalName: string): string {
  const name = originalName.trim();
  if (
    name === '' ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0')
  ) {
    throw new BadRequestException(`Invalid file name: "${originalName}"`);
  }
  return name;
}
