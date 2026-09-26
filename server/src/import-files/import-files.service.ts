import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { UploadedImportFileDto } from './dto/uploaded-import-file.dto';
import { ImportDocumentType } from './import-files.enums';

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

/** Contents of the `import_account_files.data` JSONB column, one per file. */
export interface ImportAccountFileData {
  documentType: ImportDocumentType;
  name: string;
  size: number;
  mimeType: string;
  relativePath: string;
  uploadedAt: string;
}

export const SELECT_ACCOUNT_EXISTS_SQL =
  'SELECT id FROM order_account WHERE id = $1';

export const INSERT_IMPORT_ACCOUNT_FILE_SQL = `INSERT INTO import_account_files (account_id, data)
   VALUES ($1, $2::jsonb)
   RETURNING id`;

const PG_FOREIGN_KEY_VIOLATION = '23503';

/**
 * Persists uploaded import paperwork: the bytes go to disk under
 * `<storage root>/<accountNumber>/` (original names kept) and one
 * `import_account_files` row per file records its descriptor as JSONB.
 * The rows are written in a single transaction so a failed insert leaves
 * no partial batch behind.
 */
@Injectable()
export class ImportFilesService {
  constructor(
    @Inject(IMPORT_FILES_STORAGE_DIR) private readonly storageDir: string,
    private readonly db: DatabaseService,
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
        };
        const id = await insertFileRow(client, accountNumber, data);
        results.push({ id, ...data });
      }
      return results;
    });
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

function accountNotFound(accountNumber: number): NotFoundException {
  return new NotFoundException(
    `Import case (account) ${accountNumber} not found`,
  );
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
