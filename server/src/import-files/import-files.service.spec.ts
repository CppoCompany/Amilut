import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { DatabaseService } from '../database/database.service';
import { ImportDocumentType } from './import-files.enums';
import {
  INSERT_IMPORT_ACCOUNT_FILE_SQL,
  ImportFilesService,
  SELECT_ACCOUNT_EXISTS_SQL,
  safeFileName,
} from './import-files.service';

// The real DatabaseService pulls in @nestjs/config (ESM-only), which the
// project's jest transform does not handle. The service is fully mocked here,
// so replace the module with a stand-in class that carries the same token.
jest.mock('../database/database.service', () => ({
  DatabaseService: class DatabaseService {},
}));

type ClientMock = { query: jest.Mock };
type DbMock = {
  query: jest.Mock;
  queryOne: jest.Mock;
  transaction: jest.Mock;
};

function fakeFile(
  originalname: string,
  content: string,
  mimetype = 'application/pdf',
) {
  const buffer = Buffer.from(content, 'utf8');
  return { originalname, buffer, size: buffer.length, mimetype };
}

const INVOICE = ImportDocumentType.SUPPLIER_INVOICE;

describe('ImportFilesService', () => {
  let storageDir: string;
  let service: ImportFilesService;
  let client: ClientMock;
  let db: DbMock;

  /** Default DB behaviour: every account exists, inserts return ids 1, 2, 3, … */
  function accountsExistAndInsertsSucceed() {
    let nextId = 1;
    client.query.mockImplementation((sql: string, params: unknown[]) => {
      if (sql === SELECT_ACCOUNT_EXISTS_SQL) {
        return Promise.resolve({ rows: [{ id: params[0] }] });
      }
      if (sql === INSERT_IMPORT_ACCOUNT_FILE_SQL) {
        return Promise.resolve({ rows: [{ id: nextId++ }] });
      }
      return Promise.reject(new Error(`Unexpected SQL: ${sql}`));
    });
  }

  function insertCalls(): [string, unknown[]][] {
    return (client.query.mock.calls as [string, unknown[]][]).filter(
      ([sql]) => sql === INSERT_IMPORT_ACCOUNT_FILE_SQL,
    );
  }

  beforeEach(async () => {
    storageDir = await mkdtemp(path.join(tmpdir(), 'amilut-storage-'));
    client = { query: jest.fn() };
    db = {
      query: jest.fn(),
      queryOne: jest.fn(),
      // Runs the unit of work against the mocked client; rethrows like the real one.
      transaction: jest.fn((work: (c: ClientMock) => Promise<unknown>) =>
        work(client),
      ),
    };
    accountsExistAndInsertsSucceed();
    service = new ImportFilesService(
      storageDir,
      db as unknown as DatabaseService,
    );
  });

  afterEach(() => rm(storageDir, { recursive: true, force: true }));

  it('writes every file under <storage>/<accountNumber>/ keeping the original names', async () => {
    const result = await service.uploadMultipleImportFiles(1000, INVOICE, [
      fakeFile('חשבון ספק.pdf', 'invoice'),
      fakeFile('packing list.xlsx', 'packing', 'application/vnd.ms-excel'),
    ]);

    const accountDir = path.join(storageDir, '1000');
    expect((await readdir(accountDir)).sort()).toEqual([
      'packing list.xlsx',
      'חשבון ספק.pdf',
    ]);
    expect(await readFile(path.join(accountDir, 'חשבון ספק.pdf'), 'utf8')).toBe(
      'invoice',
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 1,
      documentType: INVOICE,
      name: 'חשבון ספק.pdf',
      size: Buffer.byteLength('invoice'),
      mimeType: 'application/pdf',
      relativePath: '1000/חשבון ספק.pdf',
    });
    expect(result[1]).toMatchObject({ id: 2, name: 'packing list.xlsx' });
    expect(new Date(result[0].uploadedAt).toISOString()).toBe(
      result[0].uploadedAt,
    );
  });

  it('inserts one import_account_files row per file inside one transaction', async () => {
    const result = await service.uploadMultipleImportFiles(1000, INVOICE, [
      fakeFile('a.pdf', 'aa'),
      fakeFile('b.pdf', 'bbb', 'application/octet-stream'),
    ]);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      SELECT_ACCOUNT_EXISTS_SQL,
      [1000],
    );

    const inserts = insertCalls();
    expect(inserts).toHaveLength(2);

    const [accountId, json] = inserts[1][1];
    expect(accountId).toBe(1000);
    expect(JSON.parse(json as string)).toEqual({
      documentType: INVOICE,
      name: 'b.pdf',
      size: 3,
      mimeType: 'application/octet-stream',
      relativePath: '1000/b.pdf',
      uploadedAt: result[1].uploadedAt,
    });
    expect(result.map((r) => r.id)).toEqual([1, 2]);
  });

  it('tags every row with the requested document type', async () => {
    const result = await service.uploadMultipleImportFiles(
      5,
      ImportDocumentType.CERTIFICATE_OF_ORIGIN,
      [fakeFile('coo.pdf', 'x')],
    );

    expect(result[0].documentType).toBe(
      ImportDocumentType.CERTIFICATE_OF_ORIGIN,
    );
    const [, json] = insertCalls()[0][1];
    const data = JSON.parse(json as string) as { documentType: string };
    expect(data.documentType).toBe(ImportDocumentType.CERTIFICATE_OF_ORIGIN);
  });

  it('overwrites a file that already exists with the same name', async () => {
    await service.uploadMultipleImportFiles(7, INVOICE, [
      fakeFile('a.pdf', 'old'),
    ]);
    await service.uploadMultipleImportFiles(7, INVOICE, [
      fakeFile('a.pdf', 'new'),
    ]);

    expect(await readFile(path.join(storageDir, '7', 'a.pdf'), 'utf8')).toBe(
      'new',
    );
  });

  it('rejects an empty upload', async () => {
    await expect(
      service.uploadMultipleImportFiles(1000, INVOICE, []),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-positive account number', async () => {
    await expect(
      service.uploadMultipleImportFiles(0, INVOICE, [fakeFile('a.pdf', 'x')]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing document type without touching disk or database', async () => {
    await expect(
      service.uploadMultipleImportFiles(
        1000,
        undefined as unknown as ImportDocumentType,
        [fakeFile('a.pdf', 'x')],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.transaction).not.toHaveBeenCalled();
    await expect(readdir(path.join(storageDir, '1000'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects a document type outside the enum', async () => {
    await expect(
      service.uploadMultipleImportFiles(1000, 'INVOICE' as ImportDocumentType, [
        fakeFile('a.pdf', 'x'),
      ]),
    ).rejects.toThrow('documentType must be one of');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('writes nothing when one of the names is unsafe', async () => {
    await expect(
      service.uploadMultipleImportFiles(9, INVOICE, [
        fakeFile('ok.pdf', 'x'),
        fakeFile('../evil.pdf', 'y'),
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.transaction).not.toHaveBeenCalled();
    await expect(readdir(path.join(storageDir, '9'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('returns 404 and writes nothing when the account does not exist', async () => {
    client.query.mockImplementation((sql: string) =>
      sql === SELECT_ACCOUNT_EXISTS_SQL
        ? Promise.resolve({ rows: [] })
        : Promise.reject(new Error(`Unexpected SQL: ${sql}`)),
    );

    await expect(
      service.uploadMultipleImportFiles(404, INVOICE, [fakeFile('a.pdf', 'x')]),
    ).rejects.toMatchObject({
      constructor: NotFoundException,
      message: 'Import case (account) 404 not found',
    });

    expect(insertCalls()).toHaveLength(0);
    await expect(readdir(path.join(storageDir, '404'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('maps a foreign-key violation on insert (23503) to 404', async () => {
    client.query.mockImplementation((sql: string, params: unknown[]) =>
      sql === SELECT_ACCOUNT_EXISTS_SQL
        ? Promise.resolve({ rows: [{ id: params[0] }] })
        : Promise.reject(Object.assign(new Error('fk'), { code: '23503' })),
    );

    await expect(
      service.uploadMultipleImportFiles(12, INVOICE, [fakeFile('a.pdf', 'x')]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates other insert errors so the transaction rolls back', async () => {
    let calls = 0;
    client.query.mockImplementation((sql: string, params: unknown[]) => {
      if (sql === SELECT_ACCOUNT_EXISTS_SQL) {
        return Promise.resolve({ rows: [{ id: params[0] }] });
      }
      calls += 1;
      return calls === 1
        ? Promise.resolve({ rows: [{ id: 1 }] })
        : Promise.reject(new Error('disk full'));
    });

    await expect(
      service.uploadMultipleImportFiles(3, INVOICE, [
        fakeFile('a.pdf', 'x'),
        fakeFile('b.pdf', 'y'),
      ]),
    ).rejects.toThrow('disk full');
    // The rejection bubbles through transaction(), which is what triggers ROLLBACK.
    await expect(db.transaction.mock.results[0].value).rejects.toThrow(
      'disk full',
    );
  });

  it('rejects file names that could escape the account folder', () => {
    for (const bad of [
      '',
      ' ',
      '..',
      '../x.pdf',
      'a/b.pdf',
      'a\\b.pdf',
      'a\0.pdf',
    ]) {
      expect(() => safeFileName(bad)).toThrow(BadRequestException);
    }
    expect(safeFileName(' תעודת מקור.pdf ')).toBe('תעודת מקור.pdf');
  });
});
