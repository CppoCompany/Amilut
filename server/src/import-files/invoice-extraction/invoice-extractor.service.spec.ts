import { Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import {
  detectFileKind,
  InvoiceExtractorService,
  UNSUPPORTED_FILE_TYPE_ERROR,
} from './invoice-extractor.service';
import { SUPPLIER_INVOICE_FIXTURE } from './pdf-invoice-extractor.spec';
import { SAMPLE_SHEET, workbookBuffer } from './xlsx-invoice-extractor.spec';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('InvoiceExtractorService', () => {
  const service = new InvoiceExtractorService();

  beforeAll(() => {
    Logger.overrideLogger(false);
  });
  afterAll(async () => {
    Logger.overrideLogger(true);
    // pdf.js arms a ~500ms one-shot recovery timer when a buffer is not a PDF
    // (the "parser failure" case below); let it expire so the jest worker can
    // exit without being force-killed.
    await new Promise((resolve) => setTimeout(resolve, 750));
  });

  it('routes a PDF to the PDF extractor', async () => {
    const result = await service.extract({
      buffer: await readFile(SUPPLIER_INVOICE_FIXTURE),
      mimetype: 'application/pdf',
      originalname: 'חשבון ספק.pdf',
    });

    expect(result.extractionError).toBeUndefined();
    expect(result.lineItems).toHaveLength(66);
  });

  it('routes an .xlsx to the workbook extractor even with a generic MIME type', async () => {
    const result = await service.extract({
      buffer: await workbookBuffer(SAMPLE_SHEET),
      mimetype: 'application/octet-stream',
      originalname: 'invoice.XLSX',
    });

    expect(result.extractionError).toBeUndefined();
    expect(result.lineItems).toHaveLength(3);
  });

  it('reports unsupported file types without throwing', async () => {
    await expect(
      service.extract({
        buffer: Buffer.from('jpeg bytes'),
        mimetype: 'image/jpeg',
        originalname: 'scan.jpg',
      }),
    ).resolves.toEqual({
      lineItems: [],
      extractionError: UNSUPPORTED_FILE_TYPE_ERROR,
    });
  });

  it('turns a parser failure into extractionError', async () => {
    const result = await service.extract({
      buffer: Buffer.from('this is not a pdf'),
      mimetype: 'application/pdf',
      originalname: 'broken.pdf',
    });

    expect(result.lineItems).toEqual([]);
    expect(result.extractionError).toEqual(expect.any(String));
    expect(result.extractionError).not.toMatch(/^Error:/);
    expect(result.extractionError?.length).toBeGreaterThan(0);
  });

  it('detects the file kind by extension first, then MIME type', () => {
    expect(detectFileKind({ originalname: 'a.pdf', mimetype: '' })).toBe('pdf');
    expect(
      detectFileKind({ originalname: 'a.bin', mimetype: 'application/pdf' }),
    ).toBe('pdf');
    expect(detectFileKind({ originalname: 'a.xlsx', mimetype: '' })).toBe(
      'xlsx',
    );
    expect(detectFileKind({ originalname: 'a', mimetype: XLSX_MIME })).toBe(
      'xlsx',
    );
    expect(
      detectFileKind({ originalname: 'a.png', mimetype: 'image/png' }),
    ).toBe('unsupported');
  });
});
