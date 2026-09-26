import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { InvoiceLineItemDto } from './dto/invoice-line-item.dto';
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

/** Injection token for the absolute directory that holds `<accountNumber>/<file>`. */
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

export const SELECT_ACCOUNT_EXISTS_SQL =
  'SELECT id FROM order_account WHERE id = $1';

export const INSERT_IMPORT_ACCOUNT_FILE_SQL = `INSERT INTO import_account_files (account_id, data)
   VALUES ($1, $2::jsonb)
   RETURNING id`;

/**
 * The current (newest by id) `SUPPLIER_INVOICE` row per file name for one
 * account, oldest upload first. Re-uploading a file adds a new row, so the
 * highest id per name is the one whose line items are live.
 */
export const SELECT_LATEST_SUPPLIER_INVOICE_ROWS_SQL = `SELECT data FROM (
     SELECT DISTINCT ON (data->>'name') data
       FROM import_account_files
      WHERE account_id = $1 AND data->>'documentType' = $2
      ORDER BY data->>'name', id DESC
   ) latest
   ORDER BY (data->>'uploadedAt'), (data->>'name')`;

/**
 * The current (newest by id) row per file name for one account, newest upload
 * first — what the filing screen's documents table shows. Supplier-invoice
 * line items are stripped: the list only needs the file descriptor.
 */
export const SELECT_LATEST_FILES_SQL = `SELECT id, data - 'lineItems' - 'extractionError' AS data FROM (
     SELECT DISTINCT ON (data->>'name') id, data
       FROM import_account_files
      WHERE account_id = $1
      ORDER BY data->>'name', id DESC
   ) latest
   ORDER BY (data->>'uploadedAt') DESC, id DESC`;

/** One file row by id, scoped to its account so a file can never be read through another case. */
export const SELECT_FILE_BY_ID_SQL = `SELECT id, data FROM import_account_files
   WHERE id = $1 AND account_id = $2`;

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
 * `<storage root>/<accountNumber>/` (original names kept) and one
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
   * Saves every file in `files` to `<storageDir>/<accountNumber>/<originalname>`
   * and inserts one `import_account_files` row per file tagged with
   * `documentType`. A file with the same name for the same account is
   * overwritten on disk (a new row is still added).
   *
   * @throws BadRequestException — bad account number, unknown documentType,
   *   no files, or an unsafe file name (nothing is written in that case).
   * @throws NotFoundException — `accountNumber` is not an `order_account` id.
   */
  async uploadMultipleImportFiles(
    accountNumber: number,
    documentType: ImportDocumentType,
    files: UploadedFileInput[],
  ): Promise<UploadedImportFileDto[]> {
    if (!Number.isInteger(accountNumber) || accountNumber <= 0) {
      throw new BadRequestException('accountNumber must be a positive integer');
    }
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

    const accountDir = path.join(this.storageDir, String(accountNumber));

    return this.db.transaction(async (client) => {
      // Fail before writing anything to disk when the case does not exist.
      await assertAccountExists(client, accountNumber);
      await mkdir(accountDir, { recursive: true });

      const uploadedAt = new Date().toISOString();
      const results: UploadedImportFileDto[] = [];
      for (const { file, name } of named) {
        await writeFile(path.join(accountDir, name), file.buffer);
        const data: ImportAccountFileData = {
          documentType,
          name,
          size: file.size,
          mimeType: file.mimetype,
          relativePath: `${accountNumber}/${name}`,
          uploadedAt,
          ...extractions.get(file),
        };
        const id = await insertFileRow(client, accountNumber, data);
        results.push({ id, ...data });
      }
      return results;
    });
  }

  /**
   * Line items of every supplier invoice filed for the case, in upload order,
   * using only the newest row of each file name (re-uploads supersede).
   * Items are normalised so every field is present (`''` / `null`).
   *
   * @returns `[]` when the case has no supplier invoice (or none had a table).
   * @throws BadRequestException — bad account number.
   * @throws NotFoundException — `accountNumber` is not an `order_account` id.
   */
  async getSupplierInvoiceLineItems(
    accountNumber: number,
  ): Promise<InvoiceLineItemDto[]> {
    await this.assertAccountExists(accountNumber);

    const rows = await this.db.query<{ data: Partial<ImportAccountFileData> }>(
      SELECT_LATEST_SUPPLIER_INVOICE_ROWS_SQL,
      [accountNumber, ImportDocumentType.SUPPLIER_INVOICE],
    );
    return rows.flatMap(({ data }) =>
      Array.isArray(data?.lineItems)
        ? data.lineItems.map(normaliseLineItem)
        : [],
    );
  }

  /**
   * The files filed under the case, newest upload first, one entry per file
   * name (a re-upload replaces the older row in the list). Line items are not
   * included.
   *
   * @throws BadRequestException — bad account number.
   * @throws NotFoundException — `accountNumber` is not an `order_account` id.
   */
  async listImportFiles(
    accountNumber: number,
  ): Promise<UploadedImportFileDto[]> {
    await this.assertAccountExists(accountNumber);

    const rows = await this.db.query<{
      id: number;
      data: Omit<ImportAccountFileData, 'lineItems' | 'extractionError'>;
    }>(SELECT_LATEST_FILES_SQL, [accountNumber]);
    return rows.map(({ id, data }) => ({ id, ...data }));
  }

  /**
   * Locates file `fileId` of the case on disk so the controller can stream it.
   * The path recorded in the row is re-validated against the storage root.
   *
   * @throws BadRequestException — bad account number or file id.
   * @throws NotFoundException — unknown case, no such file in that case, or
   *   the bytes are gone from disk.
   */
  async getImportFile(
    accountNumber: number,
    fileId: number,
  ): Promise<StoredImportFile> {
    await this.assertAccountExists(accountNumber);
    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new BadRequestException('fileId must be a positive integer');
    }

    const row = await this.db.queryOne<{
      id: number;
      data: Partial<ImportAccountFileData>;
    }>(SELECT_FILE_BY_ID_SQL, [fileId, accountNumber]);
    if (!row) {
      throw fileNotFound(accountNumber, fileId);
    }

    const { name, mimeType, relativePath } = row.data;
    if (typeof relativePath !== 'string' || typeof name !== 'string') {
      throw fileNotFound(accountNumber, fileId);
    }
    const absolutePath = resolveInsideStorage(this.storageDir, relativePath);
    if (absolutePath === null) {
      throw fileNotFound(accountNumber, fileId);
    }

    let onDisk;
    try {
      onDisk = await stat(absolutePath);
    } catch {
      throw fileNotFound(accountNumber, fileId);
    }
    if (!onDisk.isFile()) {
      throw fileNotFound(accountNumber, fileId);
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

  /** Validates `accountNumber` and checks the case exists (outside a transaction). */
  private async assertAccountExists(accountNumber: number): Promise<void> {
    if (!Number.isInteger(accountNumber) || accountNumber <= 0) {
      throw new BadRequestException('accountNumber must be a positive integer');
    }
    const account = await this.db.queryOne<{ id: number }>(
      SELECT_ACCOUNT_EXISTS_SQL,
      [accountNumber],
    );
    if (!account) {
      throw accountNotFound(accountNumber);
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

async function assertAccountExists(
  client: PoolClient,
  accountNumber: number,
): Promise<void> {
  const found = await client.query<{ id: number }>(SELECT_ACCOUNT_EXISTS_SQL, [
    accountNumber,
  ]);
  if (found.rows.length === 0) {
    throw accountNotFound(accountNumber);
  }
}

/** Inserts one `import_account_files` row and returns its id. */
async function insertFileRow(
  client: PoolClient,
  accountNumber: number,
  data: ImportAccountFileData,
): Promise<number> {
  let inserted;
  try {
    inserted = await client.query<{ id: number }>(
      INSERT_IMPORT_ACCOUNT_FILE_SQL,
      [accountNumber, JSON.stringify(data)],
    );
  } catch (err) {
    throw translateWriteError(err, accountNumber);
  }
  const id = inserted.rows[0]?.id;
  if (id === undefined) {
    throw new BadRequestException(`File "${data.name}" was not recorded`);
  }
  return id;
}

/** The FK on `account_id` can still fire if the case is deleted mid-request. */
function translateWriteError(err: unknown, accountNumber: number): unknown {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === PG_FOREIGN_KEY_VIOLATION) {
    return accountNotFound(accountNumber);
  }
  return err;
}

/** Fills in fields a stored line item may lack so the client always gets the full shape. */
function normaliseLineItem(
  raw: Partial<InvoiceLineItem> | null,
): InvoiceLineItemDto {
  const item = raw ?? {};
  return {
    item: typeof item.item === 'string' ? item.item : '',
    description: typeof item.description === 'string' ? item.description : '',
    quantity: numberOrNull(item.quantity),
    price: numberOrNull(item.price),
    total: numberOrNull(item.total),
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function accountNotFound(accountNumber: number): NotFoundException {
  return new NotFoundException(
    `Import case (account) ${accountNumber} not found`,
  );
}

function fileNotFound(
  accountNumber: number,
  fileId: number,
): NotFoundException {
  return new NotFoundException(
    `File ${fileId} of import case (account) ${accountNumber} not found`,
  );
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
 * account folder (path separators, `..`, empty names, NUL bytes).
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
