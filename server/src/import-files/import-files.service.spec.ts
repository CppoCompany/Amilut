import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { DatabaseService } from '../database/database.service';
import {
  ClassificationApproval,
  ClassificationLicense,
  TradeAgreement,
} from '../classification/classification.enums';
import { ImportDocumentType } from './import-files.enums';
import {
  ImportAccountFileData,
  ImportFilesContext,
  deleteFilesByNameSql,
  ImportFilesService,
  INSERT_IMPORT_ACCOUNT_FILE_SQL,
  INSERT_LINE_ITEM_NOTE_SQL,
  SELECT_CCF_EXISTS_SQL,
  SELECT_EXISTING_COUNTRY_IDS_SQL,
  SELECT_ORDER_EXISTS_SQL,
  resolveInsideStorage,
  safeFileName,
  selectFileByIdSql,
  selectLatestFilesSql,
  selectLatestSupplierInvoiceRowsSql,
  selectLineItemNotesSql,
  updateFileDataSql,
} from './import-files.service';
import { EMPTY_LINE_ITEM_CLASSIFICATION } from './line-item-classification';
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

/** Most tests use an order context — the CCF branch is exercised by its own
 *  dedicated tests, since the service's logic is fully symmetric between
 *  the two (parameterized on `contextColumn`/`contextDirName`). */
function orderContext(id: number): ImportFilesContext {
  return { kind: 'order', id };
}
function ccfContext(id: number): ImportFilesContext {
  return { kind: 'ccf', id };
}

const INVOICE = ImportDocumentType.SUPPLIER_INVOICE;

describe('ImportFilesService', () => {
  let storageDir: string;
  let service: ImportFilesService;
  let client: ClientMock;
  let db: DbMock;
  let extractor: ExtractorMock;

  /** Default DB behaviour: every order/CCF exists, inserts return ids 1, 2, 3, … */
  function contextsExistAndInsertsSucceed() {
    let nextId = 1;
    client.query.mockImplementation((sql: string, params: unknown[]) => {
      if (sql === SELECT_ORDER_EXISTS_SQL || sql === SELECT_CCF_EXISTS_SQL) {
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

  /** The JSON written for the n-th inserted row (INSERT params: order_id, ccf_id, data). */
  function insertedData(index = 0): ImportAccountFileData {
    const [, , json] = insertCalls()[index][1];
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
    contextsExistAndInsertsSucceed();
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

  it('writes every file under <storage>/order-<id>/ keeping the original names', async () => {
    const result = await service.uploadMultipleImportFiles(
      orderContext(1000),
      INVOICE,
      [
        fakeFile('חשבון ספק.pdf', 'invoice'),
        fakeFile('packing list.xlsx', 'packing', 'application/vnd.ms-excel'),
      ],
    );

    const contextDir = path.join(storageDir, 'order-1000');
    expect((await readdir(contextDir)).sort()).toEqual([
      'packing list.xlsx',
      'חשבון ספק.pdf',
    ]);
    expect(await readFile(path.join(contextDir, 'חשבון ספק.pdf'), 'utf8')).toBe(
      'invoice',
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 1,
      documentType: INVOICE,
      name: 'חשבון ספק.pdf',
      size: Buffer.byteLength('invoice'),
      mimeType: 'application/pdf',
      relativePath: 'order-1000/חשבון ספק.pdf',
    });
    expect(result[1]).toMatchObject({ id: 2, name: 'packing list.xlsx' });
    expect(new Date(result[0].uploadedAt).toISOString()).toBe(
      result[0].uploadedAt,
    );
  });

  it('writes every file under <storage>/ccf-<id>/ when scoped to a CCF', async () => {
    const result = await service.uploadMultipleImportFiles(
      ccfContext(7),
      INVOICE,
      [fakeFile('a.pdf', 'x')],
    );

    expect(client.query).toHaveBeenCalledWith(SELECT_CCF_EXISTS_SQL, [7]);
    expect(
      await readFile(path.join(storageDir, 'ccf-7', 'a.pdf'), 'utf8'),
    ).toBe('x');
    expect(result[0].relativePath).toBe('ccf-7/a.pdf');

    const [orderId, ccfId] = insertCalls()[0][1];
    expect(orderId).toBeNull();
    expect(ccfId).toBe(7);
  });

  it('inserts one import_account_files row per file inside one transaction', async () => {
    const result = await service.uploadMultipleImportFiles(
      orderContext(1000),
      INVOICE,
      [
        fakeFile('a.pdf', 'aa'),
        fakeFile('b.pdf', 'bbb', 'application/octet-stream'),
      ],
    );

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(SELECT_ORDER_EXISTS_SQL, [1000]);

    const inserts = insertCalls();
    expect(inserts).toHaveLength(2);

    const [orderId, ccfId, json] = inserts[1][1];
    expect(orderId).toBe(1000);
    expect(ccfId).toBeNull();
    expect(JSON.parse(json as string)).toEqual({
      documentType: INVOICE,
      name: 'b.pdf',
      size: 3,
      mimeType: 'application/octet-stream',
      relativePath: 'order-1000/b.pdf',
      uploadedAt: result[1].uploadedAt,
      lineItems: [],
    });
    expect(result.map((r) => r.id)).toEqual([1, 2]);
  });

  describe('supplier invoice line items', () => {
    it('stores the extracted line items in the row JSON and returns them', async () => {
      extractor.extract.mockResolvedValue({ lineItems: [LINE_ITEM] });
      const file = fakeFile('חשבון ספק.pdf', 'invoice');

      const result = await service.uploadMultipleImportFiles(
        orderContext(1000),
        INVOICE,
        [file],
      );

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
      expect(result[0].lineItems).toEqual([
        {
          ...LINE_ITEM,
          fileId: 1,
          lineIndex: 0,
          classification: EMPTY_LINE_ITEM_CLASSIFICATION,
        },
      ]);
      expect(result[0].extractionError).toBeUndefined();
    });

    it('stores an empty list plus the reason when nothing could be extracted', async () => {
      extractor.extract.mockResolvedValue({
        lineItems: [],
        extractionError: 'No line-item table found',
      });

      const result = await service.uploadMultipleImportFiles(
        orderContext(1000),
        INVOICE,
        [fakeFile('scan.pdf', 'x')],
      );

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
        orderContext(1000),
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

      const result = await service.uploadMultipleImportFiles(
        orderContext(1000),
        INVOICE,
        [fakeFile('bad.pdf', 'x')],
      );

      expect(result).toHaveLength(1);
      expect(insertedData()).toMatchObject({
        name: 'bad.pdf',
        lineItems: [],
        extractionError: 'pdf2json exploded',
      });
      expect(
        await readFile(path.join(storageDir, 'order-1000', 'bad.pdf'), 'utf8'),
      ).toBe('x');
    });

    it('extracts the goods table from a real supplier invoice PDF', async () => {
      service = new ImportFilesService(
        storageDir,
        db as unknown as DatabaseService,
        new InvoiceExtractorService(),
      );
      const buffer = await readFile(SUPPLIER_INVOICE_FIXTURE);

      const result = await service.uploadMultipleImportFiles(
        orderContext(1000),
        INVOICE,
        [
          {
            originalname: 'חשבון ספק.pdf',
            buffer,
            size: buffer.length,
            mimetype: 'application/pdf',
          },
        ],
      );

      const data = insertedData();
      expect(data.extractionError).toBeUndefined();
      expect(data.lineItems).toHaveLength(66);
      expect(data.lineItems?.[0]).toEqual(LINE_ITEM);
      expect(result[0].lineItems).toHaveLength(66);
    });
  });

  it('tags every row with the requested document type', async () => {
    const result = await service.uploadMultipleImportFiles(
      orderContext(5),
      ImportDocumentType.CERTIFICATE_OF_ORIGIN,
      [fakeFile('coo.pdf', 'x')],
    );

    expect(result[0].documentType).toBe(
      ImportDocumentType.CERTIFICATE_OF_ORIGIN,
    );
    const [, , json] = insertCalls()[0][1];
    const data = JSON.parse(json as string) as { documentType: string };
    expect(data.documentType).toBe(ImportDocumentType.CERTIFICATE_OF_ORIGIN);
  });

  it('overwrites a file that already exists with the same name', async () => {
    await service.uploadMultipleImportFiles(orderContext(7), INVOICE, [
      fakeFile('a.pdf', 'old'),
    ]);
    await service.uploadMultipleImportFiles(orderContext(7), INVOICE, [
      fakeFile('a.pdf', 'new'),
    ]);

    expect(
      await readFile(path.join(storageDir, 'order-7', 'a.pdf'), 'utf8'),
    ).toBe('new');
  });

  it('rejects an empty upload', async () => {
    await expect(
      service.uploadMultipleImportFiles(orderContext(1000), INVOICE, []),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing document type without touching disk or database', async () => {
    await expect(
      service.uploadMultipleImportFiles(
        orderContext(1000),
        undefined as unknown as ImportDocumentType,
        [fakeFile('a.pdf', 'x')],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.transaction).not.toHaveBeenCalled();
    await expect(
      readdir(path.join(storageDir, 'order-1000')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a document type outside the enum', async () => {
    await expect(
      service.uploadMultipleImportFiles(
        orderContext(1000),
        'INVOICE' as ImportDocumentType,
        [fakeFile('a.pdf', 'x')],
      ),
    ).rejects.toThrow('documentType must be one of');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('writes nothing when one of the names is unsafe', async () => {
    await expect(
      service.uploadMultipleImportFiles(orderContext(9), INVOICE, [
        fakeFile('ok.pdf', 'x'),
        fakeFile('../evil.pdf', 'y'),
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.transaction).not.toHaveBeenCalled();
    await expect(
      readdir(path.join(storageDir, 'order-9')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns 404 and writes nothing when the order does not exist', async () => {
    client.query.mockImplementation((sql: string) =>
      sql === SELECT_ORDER_EXISTS_SQL
        ? Promise.resolve({ rows: [] })
        : Promise.reject(new Error(`Unexpected SQL: ${sql}`)),
    );

    await expect(
      service.uploadMultipleImportFiles(orderContext(404), INVOICE, [
        fakeFile('a.pdf', 'x'),
      ]),
    ).rejects.toMatchObject({
      constructor: NotFoundException,
      message: 'Order 404 not found',
    });

    expect(insertCalls()).toHaveLength(0);
    await expect(
      readdir(path.join(storageDir, 'order-404')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('maps a foreign-key violation on insert (23503) to 404', async () => {
    client.query.mockImplementation((sql: string, params: unknown[]) =>
      sql === SELECT_ORDER_EXISTS_SQL
        ? Promise.resolve({ rows: [{ id: params[0] }] })
        : Promise.reject(Object.assign(new Error('fk'), { code: '23503' })),
    );

    await expect(
      service.uploadMultipleImportFiles(orderContext(12), INVOICE, [
        fakeFile('a.pdf', 'x'),
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates other insert errors so the transaction rolls back', async () => {
    let calls = 0;
    client.query.mockImplementation((sql: string, params: unknown[]) => {
      if (sql === SELECT_ORDER_EXISTS_SQL) {
        return Promise.resolve({ rows: [{ id: params[0] }] });
      }
      calls += 1;
      return calls === 1
        ? Promise.resolve({ rows: [{ id: 1 }] })
        : Promise.reject(new Error('disk full'));
    });

    await expect(
      service.uploadMultipleImportFiles(orderContext(3), INVOICE, [
        fakeFile('a.pdf', 'x'),
        fakeFile('b.pdf', 'y'),
      ]),
    ).rejects.toThrow('disk full');
    // The rejection bubbles through transaction(), which is what triggers ROLLBACK.
    await expect(db.transaction.mock.results[0].value).rejects.toThrow(
      'disk full',
    );
  });

  it('rejects file names that could escape the storage folder', () => {
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

    let nextRowId = 1;
    beforeEach(() => {
      nextRowId = 1;
    });

    function invoiceRow(
      name: string,
      uploadedAt: string,
      extra: Partial<ImportAccountFileData> = {},
    ): { id: number; data: ImportAccountFileData } {
      return {
        id: nextRowId++,
        data: {
          documentType: INVOICE,
          name,
          size: 1,
          mimeType: 'application/pdf',
          relativePath: `order-1000/${name}`,
          uploadedAt,
          ...extra,
        },
      };
    }

    /** `db.queryOne` finds the order; `db.query` answers the line-item SQL with `rows`. */
    function orderExistsWithRows(rows: { id?: number; data: unknown }[]) {
      db.queryOne.mockImplementation((sql: string, params: unknown[]) =>
        sql === SELECT_ORDER_EXISTS_SQL
          ? Promise.resolve({ id: params[0] })
          : Promise.reject(new Error(`Unexpected SQL: ${sql}`)),
      );
      db.query.mockImplementation((sql: string) =>
        sql === selectLatestSupplierInvoiceRowsSql(orderContext(1000))
          ? Promise.resolve(rows)
          : Promise.reject(new Error(`Unexpected SQL: ${sql}`)),
      );
    }

    it('returns [] when the order has no supplier invoice rows', async () => {
      orderExistsWithRows([]);

      await expect(
        service.getSupplierInvoiceLineItems(orderContext(1000)),
      ).resolves.toEqual([]);
      expect(db.queryOne).toHaveBeenCalledWith(SELECT_ORDER_EXISTS_SQL, [1000]);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('queries only the newest SUPPLIER_INVOICE row per file name and maps its items', async () => {
      orderExistsWithRows([
        invoiceRow('a.pdf', '2026-09-20T10:00:00.000Z', {
          lineItems: [SECOND_ITEM],
        }),
      ]);

      const result = await service.getSupplierInvoiceLineItems(
        orderContext(1000),
      );

      expect(db.query).toHaveBeenCalledTimes(1);
      expect(db.query).toHaveBeenCalledWith(
        selectLatestSupplierInvoiceRowsSql(orderContext(1000)),
        [1000, INVOICE],
      );
      // The de-duplication lives in the SQL itself.
      const sql = selectLatestSupplierInvoiceRowsSql(orderContext(1000));
      expect(sql).toContain("DISTINCT ON (data->>'name')");
      expect(sql).toContain('id DESC');
      expect(sql).toContain("data->>'documentType' = $2");
      expect(sql).toContain('WHERE order_id = $1');
      expect(result).toEqual([
        {
          ...SECOND_ITEM,
          fileId: 1,
          lineIndex: 0,
          classification: EMPTY_LINE_ITEM_CLASSIFICATION,
        },
      ]);
    });

    it('scopes by ccf_id instead when given a CCF context', () => {
      const sql = selectLatestSupplierInvoiceRowsSql(ccfContext(7));
      expect(sql).toContain('WHERE ccf_id = $1');
    });

    it('returns the stored classification of a line, normalised', async () => {
      orderExistsWithRows([
        invoiceRow('a.pdf', '2026-09-20T10:00:00.000Z', {
          lineItems: [
            {
              ...LINE_ITEM,
              classification: {
                tradeAgreement: TradeAgreement.EU,
                classificationCode: '8539.50.00',
                approvals: [
                  ClassificationApproval.STANDARD_OR_DECLARATION,
                  ClassificationApproval.STANDARD_OR_DECLARATION,
                  'bogus',
                ],
                licenses: [ClassificationLicense.VEHICLE_PARTS_TRADE, 'nope'],
                countryId: 106,
              } as unknown as InvoiceLineItem['classification'],
            },
            { ...SECOND_ITEM, classification: { countryId: -3 } as never },
          ],
        }),
      ]);

      const [first, second] = await service.getSupplierInvoiceLineItems(
        orderContext(1000),
      );

      expect(first.classification).toEqual({
        tradeAgreement: TradeAgreement.EU,
        classificationCode: '8539.50.00',
        approvals: [ClassificationApproval.STANDARD_OR_DECLARATION],
        licenses: [ClassificationLicense.VEHICLE_PARTS_TRADE],
        countryId: 106,
      });
      expect(second.classification).toEqual(EMPTY_LINE_ITEM_CLASSIFICATION);
    });

    it('concatenates the items of several invoices in the order the SQL returns them (uploadedAt)', async () => {
      orderExistsWithRows([
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

      const result = await service.getSupplierInvoiceLineItems(
        orderContext(1000),
      );

      expect(
        result.map(({ item, fileId, lineIndex }) => [item, fileId, lineIndex]),
      ).toEqual([
        [LINE_ITEM.item, 1, 0],
        [SECOND_ITEM.item, 3, 0],
        [LINE_ITEM.item, 3, 1],
      ]);
    });

    it('skips rows without lineItems and normalises missing fields', async () => {
      orderExistsWithRows([
        invoiceRow('no-items.pdf', '2026-09-20T10:00:00.000Z'),
        {
          id: 2,
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

      await expect(
        service.getSupplierInvoiceLineItems(orderContext(1000)),
      ).resolves.toEqual([
        {
          fileId: 2,
          lineIndex: 0,
          item: 'ONLY-CODE',
          description: '',
          quantity: null,
          price: null,
          total: null,
          classification: EMPTY_LINE_ITEM_CLASSIFICATION,
        },
        {
          fileId: 2,
          lineIndex: 1,
          item: '',
          description: 'no numbers',
          quantity: null,
          price: null,
          total: null,
          classification: EMPTY_LINE_ITEM_CLASSIFICATION,
        },
        {
          fileId: 2,
          lineIndex: 2,
          item: '',
          description: '',
          quantity: null,
          price: null,
          total: null,
          classification: EMPTY_LINE_ITEM_CLASSIFICATION,
        },
      ]);
    });

    it('returns 404 when the order does not exist', async () => {
      db.queryOne.mockResolvedValue(null);

      await expect(
        service.getSupplierInvoiceLineItems(orderContext(404)),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        message: 'Order 404 not found',
      });
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns 404 with a CCF-specific message when scoped to an unknown CCF', async () => {
      db.queryOne.mockResolvedValue(null);

      await expect(
        service.getSupplierInvoiceLineItems(ccfContext(404)),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        message: 'Customs clearance file 404 not found',
      });
    });
  });

  describe('line item notes', () => {
    const NOTE_ROW = {
      id: 3,
      file_id: 42,
      line_index: 1,
      body: 'לבדוק מול הספק',
      created_by_name: 'Dana Levi',
      created_at: new Date('2026-09-20T08:30:00.000Z'),
    };
    const NOTE_DTO = {
      id: 3,
      fileId: 42,
      lineIndex: 1,
      body: 'לבדוק מול הספק',
      createdByName: 'Dana Levi',
      createdAt: '2026-09-20T08:30:00.000Z',
    };

    /** `db.queryOne` finds the CCF, its file 42 (two lines) and returns the inserted note. */
    function ccfWithFile() {
      db.queryOne.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === SELECT_CCF_EXISTS_SQL) {
          return Promise.resolve(params[0] === 7 ? { id: 7 } : null);
        }
        if (sql === selectFileByIdSql(ccfContext(7))) {
          return Promise.resolve(
            params[0] === 42
              ? { id: 42, data: { lineItems: [LINE_ITEM, LINE_ITEM] } }
              : null,
          );
        }
        if (sql === INSERT_LINE_ITEM_NOTE_SQL) {
          return Promise.resolve(NOTE_ROW);
        }
        return Promise.reject(new Error(`Unexpected SQL: ${sql}`));
      });
    }

    it('lists the notes of the context, mapped to DTOs', async () => {
      ccfWithFile();
      db.query.mockResolvedValue([NOTE_ROW]);

      await expect(service.listLineItemNotes(ccfContext(7))).resolves.toEqual([
        NOTE_DTO,
      ]);
      expect(db.query).toHaveBeenCalledWith(
        selectLineItemNotesSql(ccfContext(7)),
        [7],
      );
      expect(selectLineItemNotesSql(ccfContext(7))).toContain(
        'WHERE f.ccf_id = $1',
      );
    });

    it('rejects listing for an unknown context', async () => {
      ccfWithFile();

      await expect(
        service.listLineItemNotes(ccfContext(8)),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('inserts a note attributed to the user and returns it', async () => {
      ccfWithFile();

      await expect(
        service.addLineItemNote(
          ccfContext(7),
          { fileId: 42, lineIndex: 1, body: 'לבדוק מול הספק' },
          5,
        ),
      ).resolves.toEqual(NOTE_DTO);
      expect(db.queryOne).toHaveBeenCalledWith(INSERT_LINE_ITEM_NOTE_SQL, [
        42,
        1,
        'לבדוק מול הספק',
        5,
      ]);
    });

    it('rejects a file that is not one of the context', async () => {
      ccfWithFile();

      await expect(
        service.addLineItemNote(
          ccfContext(7),
          { fileId: 99, lineIndex: 0, body: 'x' },
          5,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a line index outside the file', async () => {
      ccfWithFile();

      await expect(
        service.addLineItemNote(
          ccfContext(7),
          { fileId: 42, lineIndex: 2, body: 'x' },
          5,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.queryOne).not.toHaveBeenCalledWith(
        INSERT_LINE_ITEM_NOTE_SQL,
        expect.anything(),
      );
    });
  });

  describe('saveLineItemClassifications', () => {
    const FILE_DATA: ImportAccountFileData = {
      documentType: INVOICE,
      name: 'a.pdf',
      size: 1,
      mimeType: 'application/pdf',
      relativePath: 'order-1000/a.pdf',
      uploadedAt: '2026-09-20T10:00:00.000Z',
      lineItems: [
        LINE_ITEM,
        { ...LINE_ITEM, item: 'Z-100', description: 'Cables' },
      ],
    };

    const UPDATE = {
      fileId: 42,
      lineIndex: 1,
      tradeAgreement: TradeAgreement.USA,
      classificationCode: ' 8544.42 ',
      approvals: [
        ClassificationApproval.STANDARD_OR_DECLARATION,
        ClassificationApproval.STANDARD_OR_DECLARATION,
      ],
      licenses: [
        ClassificationLicense.HEALTH_PHARMACY_DIVISION,
        ClassificationLicense.HEALTH_PHARMACY_DIVISION,
      ],
      countryId: 106,
    };

    /** Transaction client: order exists, countries exist, file 42 holds FILE_DATA, updates succeed. */
    function fileRowExists(data: ImportAccountFileData | null = FILE_DATA) {
      client.query.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === SELECT_ORDER_EXISTS_SQL) {
          return Promise.resolve({ rows: [{ id: params[0] }] });
        }
        if (sql === SELECT_EXISTING_COUNTRY_IDS_SQL) {
          return Promise.resolve({
            rows: (params[0] as number[])
              .filter((id) => id !== 999)
              .map((id) => ({ id })),
          });
        }
        if (sql === selectFileByIdSql(orderContext(1000), true)) {
          return Promise.resolve({
            rows: params[0] === 42 && data ? [{ id: 42, data }] : [],
          });
        }
        if (sql === updateFileDataSql(orderContext(1000))) {
          return Promise.resolve({ rows: [], rowCount: 1 });
        }
        return Promise.reject(new Error(`Unexpected SQL: ${sql}`));
      });
      // The refreshed list read after the transaction.
      db.queryOne.mockResolvedValue({ id: 1000 });
      db.query.mockResolvedValue([]);
    }

    it('writes the classification into the stored line and returns the refreshed list', async () => {
      fileRowExists();

      const result = await service.saveLineItemClassifications(
        orderContext(1000),
        [UPDATE],
      );

      const calls = client.query.mock.calls as [string, unknown[]][];
      const updateCall = calls.find(
        ([sql]) => sql === updateFileDataSql(orderContext(1000)),
      );
      expect(updateCall).toBeDefined();
      const [, params] = updateCall as [string, unknown[]];
      expect(params[0]).toBe(42);
      expect(params[2]).toBe(1000);
      const written = JSON.parse(params[1] as string) as ImportAccountFileData;
      expect(written.name).toBe('a.pdf');
      expect(written.lineItems?.[0]).toEqual(LINE_ITEM); // untouched
      expect(written.lineItems?.[1]).toEqual({
        ...LINE_ITEM,
        item: 'Z-100',
        description: 'Cables',
        classification: {
          tradeAgreement: TradeAgreement.USA,
          classificationCode: '8544.42',
          approvals: [ClassificationApproval.STANDARD_OR_DECLARATION],
          licenses: [ClassificationLicense.HEALTH_PHARMACY_DIVISION],
          countryId: 106,
        },
      });
      expect(client.query).toHaveBeenCalledWith(
        selectFileByIdSql(orderContext(1000), true),
        [42, 1000],
      );
      expect(selectFileByIdSql(orderContext(1000), true)).toContain(
        'FOR UPDATE',
      );
      // Refreshed via the normal read path.
      expect(db.query).toHaveBeenCalledWith(
        selectLatestSupplierInvoiceRowsSql(orderContext(1000)),
        [1000, INVOICE],
      );
      expect(result).toEqual([]);
    });

    it('does not open a transaction for an empty batch', async () => {
      fileRowExists();

      await service.saveLineItemClassifications(orderContext(1000), []);

      expect(db.transaction).not.toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledWith(
        selectLatestSupplierInvoiceRowsSql(orderContext(1000)),
        [1000, INVOICE],
      );
    });

    it('rejects a line index outside the file and writes nothing', async () => {
      fileRowExists();

      await expect(
        service.saveLineItemClassifications(orderContext(1000), [
          { ...UPDATE, lineIndex: 2 },
        ]),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'File 42 has no line item at index 2',
      });
      expect(client.query).not.toHaveBeenCalledWith(
        updateFileDataSql(orderContext(1000)),
        expect.anything(),
      );
    });

    it('404s a fileId that is not a file of the order', async () => {
      fileRowExists();

      await expect(
        service.saveLineItemClassifications(orderContext(1000), [
          { ...UPDATE, fileId: 7 },
        ]),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        message: 'File 7 of order 1000 not found',
      });
    });

    it('rejects an unknown country id before touching any file', async () => {
      fileRowExists();

      await expect(
        service.saveLineItemClassifications(orderContext(1000), [
          { ...UPDATE, countryId: 999 },
        ]),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'Unknown country id(s): 999',
      });
      expect(client.query).not.toHaveBeenCalledWith(
        selectFileByIdSql(orderContext(1000), true),
        expect.anything(),
      );
    });
  });

  describe('listImportFiles', () => {
    const FILE_B = {
      documentType: INVOICE,
      name: 'b.pdf',
      size: 2,
      mimeType: 'application/pdf',
      relativePath: 'order-1000/b.pdf',
      uploadedAt: '2026-09-22T10:00:00.000Z',
    };
    const FILE_A = {
      documentType: ImportDocumentType.PACKING_LIST,
      name: 'a.pdf',
      size: 1,
      mimeType: 'application/pdf',
      relativePath: 'order-1000/a.pdf',
      uploadedAt: '2026-09-21T10:00:00.000Z',
    };

    it('returns the rows the SQL yields as file descriptors (id + data), newest first', async () => {
      db.queryOne.mockResolvedValue({ id: 1000 });
      db.query.mockResolvedValue([
        { id: 7, data: FILE_B },
        { id: 3, data: FILE_A },
      ]);

      const result = await service.listImportFiles(orderContext(1000));

      expect(db.queryOne).toHaveBeenCalledWith(SELECT_ORDER_EXISTS_SQL, [1000]);
      expect(db.query).toHaveBeenCalledWith(
        selectLatestFilesSql(orderContext(1000)),
        [1000],
      );
      expect(result).toEqual([
        { id: 7, ...FILE_B },
        { id: 3, ...FILE_A },
      ]);
      // De-duplication, newest-first ordering and line-item stripping live in the SQL.
      const sql = selectLatestFilesSql(orderContext(1000));
      expect(sql).toContain("DISTINCT ON (data->>'name')");
      expect(sql).toContain("data - 'lineItems' - 'extractionError'");
      expect(sql).toContain("(data->>'uploadedAt') DESC");
      expect(sql).toContain('WHERE order_id = $1');
    });

    it('returns [] for an order with no files', async () => {
      db.queryOne.mockResolvedValue({ id: 1000 });
      db.query.mockResolvedValue([]);

      await expect(
        service.listImportFiles(orderContext(1000)),
      ).resolves.toEqual([]);
    });

    it('404s an unknown order', async () => {
      db.queryOne.mockResolvedValue(null);
      await expect(
        service.listImportFiles(orderContext(1000)),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.query).not.toHaveBeenCalled();
    });
  });

  describe('getImportFile', () => {
    function fileRow(
      relativePath: string,
      extra: Partial<ImportAccountFileData> = {},
    ) {
      return {
        id: 42,
        data: {
          documentType: INVOICE,
          name: path.posix.basename(relativePath),
          size: 1,
          mimeType: 'application/pdf',
          relativePath,
          uploadedAt: '2026-09-22T10:00:00.000Z',
          ...extra,
        },
      };
    }

    /** The order exists; the file lookup answers with `row`. */
    function orderExistsWithFileRow(row: unknown) {
      db.queryOne.mockImplementation((sql: string, params: unknown[]) =>
        sql === SELECT_ORDER_EXISTS_SQL
          ? Promise.resolve({ id: params[0] })
          : Promise.resolve(row),
      );
    }

    async function putOnDisk(relativePath: string, content: string) {
      const absolute = path.join(storageDir, relativePath);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, content, 'utf8');
      return absolute;
    }

    it('resolves the row to its file on disk with name, MIME type and size', async () => {
      orderExistsWithFileRow(fileRow('order-1000/חשבון ספק.pdf'));
      const absolutePath = await putOnDisk(
        'order-1000/חשבון ספק.pdf',
        'pdf-bytes',
      );

      const file = await service.getImportFile(orderContext(1000), 42);

      expect(db.queryOne).toHaveBeenCalledWith(
        selectFileByIdSql(orderContext(1000)),
        [42, 1000],
      );
      expect(file).toEqual({
        absolutePath,
        name: 'חשבון ספק.pdf',
        mimeType: 'application/pdf',
        size: 9,
      });
    });

    it('falls back to application/octet-stream when the row has no MIME type', async () => {
      orderExistsWithFileRow(fileRow('order-1000/blob.bin', { mimeType: '' }));
      await putOnDisk('order-1000/blob.bin', 'x');

      const file = await service.getImportFile(orderContext(1000), 42);

      expect(file.mimeType).toBe('application/octet-stream');
    });

    it('404s when no row with that id belongs to the order', async () => {
      orderExistsWithFileRow(null);

      await expect(
        service.getImportFile(orderContext(1000), 42),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s when the bytes are missing on disk', async () => {
      orderExistsWithFileRow(fileRow('order-1000/gone.pdf'));

      await expect(
        service.getImportFile(orderContext(1000), 42),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a stored path that escapes the storage root', async () => {
      orderExistsWithFileRow(fileRow('../outside.txt'));
      const outside = path.join(storageDir, '..', 'outside.txt');
      await writeFile(outside, 'secret');
      try {
        await expect(
          service.getImportFile(orderContext(1000), 42),
        ).rejects.toBeInstanceOf(NotFoundException);
      } finally {
        await rm(outside, { force: true });
      }
    });

    it('rejects a non-positive file id without touching the disk', async () => {
      db.queryOne.mockResolvedValue({ id: 1000 });
      await expect(
        service.getImportFile(orderContext(1000), 0),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.queryOne).toHaveBeenCalledTimes(1);
    });

    it('404s an unknown order before checking the file id', async () => {
      db.queryOne.mockResolvedValue(null);
      await expect(
        service.getImportFile(orderContext(1000), 42),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.queryOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('listClassificationsPaged', () => {
    const classifiedRow = {
      total: '3',
      file_id: 42,
      order_id: 1000,
      ccf_id: null,
      ccf_file_number: null,
      file_name: 'invoice.pdf',
      line_index: 1,
      item: 'Y8022-140BK',
      description: 'Light Fixtures',
      quantity: 15,
      price: 15.32,
      total_amount: 229.8,
      classification: {
        tradeAgreement: TradeAgreement.EU,
        classificationCode: '8539.50.00',
        approvals: [ClassificationApproval.STANDARD_OR_DECLARATION, 'bogus'],
        countryId: 106,
      },
      country_name: 'סין',
      created_at: new Date('2026-09-01T08:00:00.000Z'),
    };

    it('selects one row per classified line (newest file per name), applies the filters and a whitelisted sort', async () => {
      db.query.mockResolvedValueOnce([classifiedRow]);

      const result = await service.listClassificationsPaged({
        q: '8539',
        orderId: 1000,
        from: '2026-01-01',
        to: '2026-12-31',
        sort: 'classificationCode',
        dir: 'asc',
        page: 1,
        pageSize: 10,
      });

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/count\(\*\) OVER\(\) AS total/);
      expect(sql).toMatch(
        /jsonb_array_elements\(COALESCE\(f\.data->'lineItems', '\[\]'::jsonb\)\)/,
      );
      expect(sql).toMatch(/WITH ORDINALITY AS li\(item, idx\)/);
      expect(sql).toMatch(
        /jsonb_typeof\(li\.item->'classification'\) = 'object'/,
      );
      expect(sql).toMatch(
        /f\.id = \(SELECT max\(f2\.id\) FROM import_account_files f2/,
      );
      expect(sql).toMatch(
        /li\.item->>'item' ILIKE \$1 OR li\.item->>'description' ILIKE \$1 OR li\.item->'classification'->>'classificationCode' ILIKE \$1 OR f\.data->>'name' ILIKE \$1/,
      );
      expect(sql).toMatch(/f\.order_id = \$2/);
      expect(sql).toMatch(/f\.created_at::date >= \$3::date/);
      expect(sql).toMatch(/f\.created_at::date <= \$4::date/);
      expect(sql).toMatch(
        /ORDER BY li\.item->'classification'->>'classificationCode' ASC NULLS LAST, f\.id DESC, li\.idx ASC/,
      );
      expect(sql).toMatch(/LIMIT \$5 OFFSET \$6/);
      expect(params).toEqual([
        '%8539%',
        1000,
        '2026-01-01',
        '2026-12-31',
        10,
        0,
      ]);

      expect(result.total).toBe(3);
      expect(result.items).toEqual([
        {
          fileId: 42,
          orderId: 1000,
          ccfId: null,
          contextLabel: 'הזמנה 1000',
          fileName: 'invoice.pdf',
          lineIndex: 1,
          item: 'Y8022-140BK',
          description: 'Light Fixtures',
          quantity: 15,
          price: 15.32,
          total: 229.8,
          classification: {
            tradeAgreement: TradeAgreement.EU,
            classificationCode: '8539.50.00',
            approvals: [ClassificationApproval.STANDARD_OR_DECLARATION],
            licenses: [],
            countryId: 106,
          },
          countryName: 'סין',
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      ]);
    });

    it('labels a CCF-scoped row by its file number', async () => {
      db.query.mockResolvedValueOnce([
        {
          ...classifiedRow,
          order_id: null,
          ccf_id: 7,
          ccf_file_number: 'CCF1007',
        },
      ]);

      const result = await service.listClassificationsPaged({ ccfId: 7 });

      expect(result.items[0].contextLabel).toBe('תיק עמילות CCF1007');
      expect(result.items[0].orderId).toBeNull();
      expect(result.items[0].ccfId).toBe(7);
    });

    it('defaults to newest upload first, page 1 of 25, and never interpolates an unknown sort key', async () => {
      db.query.mockResolvedValueOnce([]);

      const result = await service.listClassificationsPaged({
        sort: 'f.id; DROP TABLE import_account_files',
      } as unknown as Parameters<
        ImportFilesService['listClassificationsPaged']
      >[0]);

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toMatch(/DROP TABLE/);
      expect(sql).toMatch(
        /ORDER BY f\.created_at DESC NULLS LAST, f\.id DESC, li\.idx ASC/,
      );
      expect(params).toEqual([25, 0]);
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
    });
  });

  describe('deleteImportFile', () => {
    const ROW = {
      id: 42,
      data: {
        documentType: INVOICE,
        name: 'invoice.pdf',
        size: 1,
        mimeType: 'application/pdf',
        relativePath: 'order-1000/invoice.pdf',
        uploadedAt: '2026-09-22T10:00:00.000Z',
      },
    };

    /** Orders exist; the locked file lookup answers with `row`; deletes succeed. */
    function fileLookupReturns(row: unknown) {
      client.query.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === SELECT_ORDER_EXISTS_SQL || sql === SELECT_CCF_EXISTS_SQL) {
          return Promise.resolve({ rows: [{ id: params[0] }] });
        }
        if (sql === selectFileByIdSql(orderContext(1000), true)) {
          return Promise.resolve({ rows: row ? [row] : [] });
        }
        if (sql === deleteFilesByNameSql(orderContext(1000))) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.reject(new Error(`Unexpected SQL: ${sql}`));
      });
    }

    it('deletes every row of that file name in the context, then the file on disk', async () => {
      fileLookupReturns(ROW);
      await mkdir(path.join(storageDir, 'order-1000'), { recursive: true });
      await writeFile(path.join(storageDir, 'order-1000/invoice.pdf'), 'x');
      await writeFile(path.join(storageDir, 'order-1000/other.pdf'), 'y');

      await service.deleteImportFile(orderContext(1000), 42);

      expect(client.query).toHaveBeenCalledWith(
        selectFileByIdSql(orderContext(1000), true),
        [42, 1000],
      );
      expect(client.query).toHaveBeenCalledWith(
        deleteFilesByNameSql(orderContext(1000)),
        [1000, 'invoice.pdf'],
      );
      expect(await readdir(path.join(storageDir, 'order-1000'))).toEqual([
        'other.pdf',
      ]);
    });

    it('scopes the delete to the context column', () => {
      expect(deleteFilesByNameSql(orderContext(1))).toContain('order_id = $1');
      expect(deleteFilesByNameSql(ccfContext(1))).toContain('ccf_id = $1');
    });

    it('still succeeds when the file is already gone from disk', async () => {
      fileLookupReturns(ROW);
      await expect(
        service.deleteImportFile(orderContext(1000), 42),
      ).resolves.toBeUndefined();
    });

    it('throws NotFound and deletes nothing when the file is not in the context', async () => {
      fileLookupReturns(null);
      await expect(
        service.deleteImportFile(orderContext(1000), 42),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(client.query).not.toHaveBeenCalledWith(
        deleteFilesByNameSql(orderContext(1000)),
        expect.anything(),
      );
    });

    it('rejects a non-positive file id before touching the DB', async () => {
      await expect(
        service.deleteImportFile(orderContext(1000), 0),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });

  describe('resolveInsideStorage', () => {
    it('returns the absolute path of a relative path inside the root', () => {
      expect(resolveInsideStorage(storageDir, 'order-1000/a.pdf')).toBe(
        path.join(storageDir, 'order-1000', 'a.pdf'),
      );
    });

    it('returns null for the root itself and for anything that escapes it', () => {
      expect(resolveInsideStorage(storageDir, '')).toBeNull();
      expect(resolveInsideStorage(storageDir, '.')).toBeNull();
      expect(resolveInsideStorage(storageDir, '../x.pdf')).toBeNull();
      expect(
        resolveInsideStorage(storageDir, 'order-1000/../../x.pdf'),
      ).toBeNull();
      expect(
        resolveInsideStorage(storageDir, path.resolve(storageDir, '..', 'x')),
      ).toBeNull();
    });
  });
});
