import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { UploadedImportFileDto } from './dto/uploaded-import-file.dto';

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
 * Persists uploaded import paperwork on disk, keeping the original file
 * names, under `<storage root>/<accountNumber>/`. No database row is written —
 * the folder listing is the source of truth for now.
 */
@Injectable()
export class ImportFilesService {
  constructor(
    @Inject(IMPORT_FILES_STORAGE_DIR) private readonly storageDir: string,
  ) {}

  /**
   * Saves every file in `files` to `<storageDir>/<accountNumber>/<originalname>`.
   * A file with the same name for the same account is overwritten.
   */
  async uploadMultipleImportFiles(
    accountNumber: number,
    files: UploadedFileInput[],
  ): Promise<UploadedImportFileDto[]> {
    if (!Number.isInteger(accountNumber) || accountNumber <= 0) {
      throw new BadRequestException('accountNumber must be a positive integer');
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
    await mkdir(accountDir, { recursive: true });

    const uploadedAt = new Date().toISOString();
    const results: UploadedImportFileDto[] = [];
    for (const { file, name } of named) {
      await writeFile(path.join(accountDir, name), file.buffer);
      results.push({
        name,
        size: file.size,
        mimeType: file.mimetype,
        relativePath: `${accountNumber}/${name}`,
        uploadedAt,
      });
    }
    return results;
  }
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
