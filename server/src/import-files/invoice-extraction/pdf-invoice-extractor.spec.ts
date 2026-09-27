import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { InvoiceExtractionResult, InvoiceLineItem } from './invoice-line-item';
import { extractPdfInvoice } from './pdf-invoice-extractor';

/**
 * Real two-page supplier invoice (text layer): header
 * `ITEM. NO | DESCRIPTION | QTY | PRICE | TOTAL`, 29 rows on page 1 and 37
 * on page 2, grand total `Total USD $33,120.02` (not a line item).
 */
export const SUPPLIER_INVOICE_FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'test',
  'fixtures',
  'supplier-invoice.pdf',
);

const LIGHT_FIXTURES = 'Light Fixtures';

describe('extractPdfInvoice', () => {
  let result: InvoiceExtractionResult;
  let items: InvoiceLineItem[];

  beforeAll(async () => {
    result = await extractPdfInvoice(await readFile(SUPPLIER_INVOICE_FIXTURE));
    items = result.lineItems;
  });

  it('extracts all 66 rows across both pages without an error', () => {
    expect(result.extractionError).toBeUndefined();
    expect(items).toHaveLength(66);
  });

  it('reads the first row of page 1', () => {
    expect(items[0]).toEqual({
      item: 'Y8022-140BK',
      description: LIGHT_FIXTURES,
      quantity: 15,
      price: 15.32,
      total: 229.8,
    });
  });

  it('keeps spaces inside item codes (page 2 rows)', () => {
    expect(items).toContainEqual({
      item: 'MS YW8027/400GD',
      description: LIGHT_FIXTURES,
      quantity: 28,
      price: 16.38,
      total: 458.64,
    });
    expect(items).toContainEqual({
      item: 'MS131F-65-BL',
      description: LIGHT_FIXTURES,
      quantity: 1000,
      price: 1.95,
      total: 1950,
    });
  });

  it('re-joins an item code split over runs by a font change', () => {
    expect(items[4].item).toBe('Y606/25P GD A 箱');
    expect(items[4].description).toBe(LIGHT_FIXTURES);
  });

  it('reads the last row and stops before the "Total USD" footer', () => {
    expect(items[items.length - 1]).toEqual({
      item: 'MS-2025-1',
      description: LIGHT_FIXTURES,
      quantity: 100,
      price: 2.51,
      total: 251,
    });
    expect(
      items.some((row) => /total|usd/i.test(`${row.item} ${row.description}`)),
    ).toBe(false);
  });

  it('parses currency-formatted amounts and sums to the grand total', () => {
    expect(items).toContainEqual({
      item: 'MS1471-108-E27-BL',
      description: LIGHT_FIXTURES,
      quantity: 510,
      price: 2.51,
      total: 1280.1,
    });
    const sum = items.reduce((acc, row) => acc + row.total, 0);
    expect(sum).toBeCloseTo(33120.02, 2);
    for (const row of items) {
      expect(row.quantity).toBeGreaterThan(0);
      expect(row.price).toBeGreaterThan(0);
      expect(row.total).toBeCloseTo(row.quantity * row.price, 1);
    }
  });
});
