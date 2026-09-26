import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { DatabaseService } from '../database/database.service';
import { ImportDocumentType } from './import-files.enums';
import {
  INSERT_IMPORT_ACCOUNT_FILE_SQL,
  ImportAccountFileData,
  ImportFilesService,
  SELECT_ACCOUNT_EXISTS_SQL,
  SELECT_LATEST_SUPPLIER_INVOICE_ROWS_SQL,
  safeFileName,
} from './import-files.service';
import { InvoiceExtractorService } from './invoice-extraction/invoice-extractor.service';
import {
  InvoiceExtractionResult,
  InvoiceLineItem,
} from './invoice-extraction/invoice-line-item';
import { SUPPLIER_INVOICE_FIXTURE } from './invoice-extraction/pdf-invoice-extractor.spec';

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
type ExtractorMock = {
  extract: jest.Mock<Promise<InvoiceExtractionResult>, [unknown]>;
};

const LINE_ITEM: InvoiceLineItem = {
  item: 'Y8022-140BK',
  description: 'Light Fixtures',
  quantity: 15,
  price: 15.32,
  total: 229.8,
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
  let extractor: ExtractorMock;

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

  /** The JSON written for the n-th inserted row. */
  function insertedData(index = 0): ImportAccountFileData {
    const [, json] = insertCalls()[index][1];
    return JSON.parse(json as string) as ImportAccountFileData;
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
    extractor = {
      extract: jest
        .fn<Promise<InvoiceExtractionResult>, [unknown]>()
        .mockResolvedValue({ lineItems: [] }),
    };
    service = new ImportFilesService(
      storageDir,
      db as unknown as DatabaseService,
      extractor as unknown as InvoiceExtractorService,
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
      lineItems: [],
    });
    expect(result.map((r) => r.id)).toEqual([1, 2]);
  });

  describe('supplier invoice line items', () => {
    it('stores the extracted line items in the row JSON and returns them', async () => {
      extractor.extract.mockResolvedValue({ lineItems: [LINE_ITEM] });
      const file = fakeFile('חשבון ספק.pdf', 'invoice');

      const result = await service.uploadMultipleImportFiles(1000, INVOICE, [
        file,
      ]);

      expect(extractor.extract).toHaveBeenCalledTimes(1);
      expect(extractor.extract).toHaveBeenCalledWith(
        expect.objectContaining({
          buffer: file.buffer,
          mimetype: 'application/pdf',
          originalname: 'חשבון ספק.pdf',
        }),
      );
      const data = insertedData();
      expect(data.lineItems).toEqual([LINE_ITEM]);
      expect(data).not.toHaveProperty('extractionError');
      expect(result[0].lineItems).toEqual([LINE_ITEM]);
      expect(result[0].extractionError).toBeUndefined();
    });

    it('stores an empty list plus the reason when nothing could be extracted', async () => {
      extractor.extract.mockResolvedValue({
        lineItems: [],
        extractionError: 'No line-item table found',
      });

      const result = await service.uploadMultipleImportFiles(1000, INVOICE, [
        fakeFile('scan.pdf', 'x'),
      ]);

      expect(insertedData()).toMatchObject({
        lineItems: [],
        extractionError: 'No line-item table found',
      });
      expect(result[0]).toMatchObject({
        id: 1,
        lineItems: [],
        extractionError: 'No line-item table found',
      });
    });

    it('does not extract or store lineItems for other document types', async () => {
      const result = await service.uploadMultipleImportFiles(
        1000,
        ImportDocumentType.BILL_OF_LADING,
        [fakeFile('bl.pdf', 'x')],
      );

      expect(extractor.extract).not.toHaveBeenCalled();
      const data = insertedData();
      expect(data).not.toHaveProperty('lineItems');
      expect(data).not.toHaveProperty('extractionError');
      expect(result[0]).not.toHaveProperty('lineItems');
    });

    it('still stores the file when the extractor throws', async () => {
      extractor.extract.mockRejectedValue(new Error('pdf2json exploded'));

      const result = await service.uploadMultipleImportFiles(1000, INVOICE, [
        fakeFile('bad.pdf', 'x'),
      ]);

      expect(result).toHaveLength(1);
      expect(insertedData()).toMatchObject({
        name: 'bad.pdf',
        lineItems: [],
        extractionError: 'pdf2json exploded',
      });
      expect(
        await readFile(path.join(storageDir, '1000', 'bad.pdf'), 'utf8'),
      ).toBe('x');
    });

    it('extracts the goods table from a real supplier invoice PDF', async () => {
      service = new ImportFilesService(
        storageDir,
        db as unknown as DatabaseService,
        new InvoiceExtractorService(),
      );
      const buffer = await readFile(SUPPLIER_INVOICE_FIXTURE);

      const result = await service.uploadMultipleImportFiles(1000, INVOICE, [
        {
          originalname: 'חשבון ספק.pdf',
          buffer,
          size: buffer.length,
          mimetype: 'application/pdf',
        },
      ]);

      const data = insertedData();
      expect(data.extractionError).toBeUndefined();
      expect(data.lineItems).toHaveLength(66);
      expect(data.lineItems?.[0]).toEqual(LINE_ITEM);
      expect(result[0].lineItems).toHaveLength(66);
    });
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

  describe('getSupplierInvoiceLineItems', () => {
    const SECOND_ITEM: InvoiceLineItem = {
      item: 'Z-100',
      description: 'Cables',
      quantity: 2,
      price: 3.5,
      total: 7,
    };

    function invoiceRow(
      name: string,
      uploadedAt: string,
      extra: Partial<ImportAccountFileData> = {},
    ): { data: ImportAccountFileData } {
      return {
        data: {
          documentType: INVOICE,
          name,
          size: 1,
          mimeType: 'application/pdf',
          relativePath: `1000/${name}`,
          uploadedAt,
          ...extra,
        },
      };
    }

    /** `db.queryOne` finds the account; `db.query` answers the line-item SQL with `rows`. */
    function accountExistsWithRows(rows: { data: unknown }[]) {
      db.queryOne.mockImplementation((sql: string, params: unknown[]) =>
        sql === SELECT_ACCOUNT_EXISTS_SQL
          ? Promise.resolve({ id: params[0] })
          : Promise.reject(new Error(`Unexpected SQL: ${sql}`)),
      );
      db.query.mockImplementation((sql: string) =>
        sql === SELECT_LATEST_SUPPLIER_INVOICE_ROWS_SQL
          ? Promise.resolve(rows)
          : Promise.reject(new Error(`Unexpected SQL: ${sql}`)),
      );
    }

    it('returns [] when the case has no supplier invoice rows', async () => {
      accountExistsWithRows([]);

      await expect(service.getSupplierInvoiceLineItems(1000)).resolves.toEqual(
        [],
      );
      expect(db.queryOne).toHaveBeenCalledWith(
        SELECT_ACCOUNT_EXISTS_SQL,
        [1000],
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('queries only the newest SUPPLIER_INVOICE row per file name and maps its items', async () => {
      accountExistsWithRows([
        invoiceRow('a.pdf', '2026-09-20T10:00:00.000Z', {
          lineItems: [SECOND_ITEM],
        }),
      ]);

      const result = await service.getSupplierInvoiceLineItems(1000);

      expect(db.query).toHaveBeenCalledTimes(1);
      expect(db.query).toHaveBeenCalledWith(
        SELECT_LATEST_SUPPLIER_INVOICE_ROWS_SQL,
        [1000, INVOICE],
      );
      // The de-duplication lives in the SQL itself.
      expect(SELECT_LATEST_SUPPLIER_INVOICE_ROWS_SQL).toContain(
        "DISTINCT ON (data->>'name')",
      );
      expect(SELECT_LATEST_SUPPLIER_INVOICE_ROWS_SQL).toContain('id DESC');
      expect(SELECT_LATEST_SUPPLIER_INVOICE_ROWS_SQL).toContain(
        "data->>'documentType' = $2",
      );
      expect(result).toEqual([SECOND_ITEM]);
    });

    it('concatenates the items of several invoices in the order the SQL returns them (uploadedAt)', async () => {
      accountExistsWithRows([
        invoiceRow('first.pdf', '2026-09-20T10:00:00.000Z', {
          lineItems: [LINE_ITEM],
        }),
        invoiceRow('scan.pdf', '2026-09-21T10:00:00.000Z', {
          lineItems: [],
          extractionError: 'No line-item table found',
        }),
        invoiceRow('second.pdf', '2026-09-22T10:00:00.000Z', {
          lineItems: [SECOND_ITEM, LINE_ITEM],
        }),
      ]);

      await expect(service.getSupplierInvoiceLineItems(1000)).resolves.toEqual([
        LINE_ITEM,
        SECOND_ITEM,
        LINE_ITEM,
      ]);
    });

    it('skips rows without lineItems and normalises missing fields', async () => {
      accountExistsWithRows([
        invoiceRow('no-items.pdf', '2026-09-20T10:00:00.000Z'),
        {
          data: {
            ...invoiceRow('partial.pdf', '2026-09-21T10:00:00.000Z').data,
            lineItems: [
              { item: 'ONLY-CODE' } as InvoiceLineItem,
              { description: 'no numbers', quantity: 'abc', price: null },
              null,
            ] as unknown as InvoiceLineItem[],
          },
        },
      ]);

      await expect(service.getSupplierInvoiceLineItems(1000)).resolves.toEqual([
        {
          item: 'ONLY-CODE',
          description: '',
          quantity: null,
          price: null,
          total: null,
        },
        {
          item: '',
          description: 'no numbers',
          quantity: null,
          price: null,
          total: null,
        },
        { item: '', description: '', quantity: null, price: null, total: null },
      ]);
    });

    it('returns 404 when the account does not exist', async () => {
      db.queryOne.mockResolvedValue(null);

      await expect(
        service.getSupplierInvoiceLineItems(404),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        message: 'Import case (account) 404 not found',
      });
      expect(db.query).not.toHaveBeenCalled();
    });

    it('rejects a non-positive or non-integer account number without querying', async () => {
      for (const bad of [0, -1, 1.5, Number.NaN]) {
        await expect(
          service.getSupplierInvoiceLineItems(bad),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(db.queryOne).not.toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();
    });
  });
});
