import { Workbook } from 'exceljs';
import { extractXlsxInvoice } from './xlsx-invoice-extractor';

/** Builds an in-memory .xlsx whose first sheet holds `rows` (one array per row). */
export async function workbookBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Invoice');
  for (const row of rows) sheet.addRow(row);
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out as unknown as Uint8Array);
}

/** Title rows, a header using synonyms, mixed number/string cells, a footer, notes. */
export const SAMPLE_SHEET: unknown[][] = [
  ['BEIJING ISTANBUL COMPANY'],
  ['INVOICE No', 'BJ2605273', 'DATE', '27.05.2026'],
  [],
  ['Item No', 'Description', 'Qty', 'Unit Price', 'Amount'],
  ['Y8022-140BK', 'Light Fixtures', 15, 15.32, 229.8],
  ['MS YW8027/400GD', '  Light   Fixtures ', '28', '$1,234.50', '$34,566.00'],
  [
    'MS131F-65-BL',
    { richText: [{ text: 'Light ' }, { text: 'Fixtures' }] },
    1000,
    1.95,
    { formula: 'C7*D7', result: 1950 },
  ],
  ['', 'Total', '', '', 36745.8],
  ['Notes', 'Payment within 30 days'],
];

describe('extractXlsxInvoice', () => {
  it('maps the rows under the header and stops at the "Total" footer', async () => {
    const result = await extractXlsxInvoice(await workbookBuffer(SAMPLE_SHEET));

    expect(result.extractionError).toBeUndefined();
    expect(result.lineItems).toEqual([
      {
        item: 'Y8022-140BK',
        description: 'Light Fixtures',
        quantity: 15,
        price: 15.32,
        total: 229.8,
      },
      {
        item: 'MS YW8027/400GD',
        description: 'Light Fixtures',
        quantity: 28,
        price: 1234.5,
        total: 34566,
      },
      {
        item: 'MS131F-65-BL',
        description: 'Light Fixtures',
        quantity: 1000,
        price: 1.95,
        total: 1950,
      },
    ]);
  });

  it('reports a sheet without a recognisable header', async () => {
    const result = await extractXlsxInvoice(
      await workbookBuffer([
        ['Packing list'],
        ['Carton', 'Weight', 'CBM'],
        [1, 12.5, 0.4],
      ]),
    );

    expect(result).toEqual({
      lineItems: [],
      extractionError: 'No line-item table found',
    });
  });

  it('reports a header with nothing under it', async () => {
    const result = await extractXlsxInvoice(
      await workbookBuffer([
        ['Item', 'Description', 'Qty', 'Price', 'Total'],
        ['', 'Total', '', '', 0],
      ]),
    );

    expect(result).toEqual({
      lineItems: [],
      extractionError: 'Table header found but no line items under it',
    });
  });

  it('rejects a buffer that is not a workbook', async () => {
    await expect(
      extractXlsxInvoice(Buffer.from('definitely not a zip')),
    ).rejects.toThrow();
  });
});
