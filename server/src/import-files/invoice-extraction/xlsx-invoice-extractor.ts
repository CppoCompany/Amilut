import { type CellValue, type Row, Workbook } from 'exceljs';
import { InvoiceExtractionResult, InvoiceLineItem } from './invoice-line-item';
import {
  classifyRow,
  detectHeaderColumns,
  HeaderColumns,
  InvoiceColumn,
  parseAmount,
  RowCells,
} from './invoice-table';

/**
 * Extracts the goods table from the first worksheet of an .xlsx workbook: the
 * first row whose cells match the column synonyms is the header, and the rows
 * below it are line items until the first row without a numeric quantity
 * (which is where a "Total" footer or trailing notes start).
 *
 * @throws Error — the buffer is not a readable .xlsx (caller turns this into
 *   `extractionError`). Legacy binary .xls is not supported by exceljs.
 */
export async function extractXlsxInvoice(
  buffer: Buffer,
): Promise<InvoiceExtractionResult> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { lineItems: [], extractionError: 'Workbook has no worksheets' };
  }

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(rowTexts(row));
  });

  let header: HeaderColumns | null = null;
  let headerIndex = -1;
  for (let i = 0; i < rows.length && !header; i += 1) {
    header = detectHeaderColumns(rows[i]);
    headerIndex = i;
  }
  if (!header) {
    return { lineItems: [], extractionError: 'No line-item table found' };
  }

  const lineItems: InvoiceLineItem[] = [];
  for (const cells of rows.slice(headerIndex + 1)) {
    const rowCells = cellsOf(cells, header);
    if (parseAmount(rowCells.quantity) === null) break;
    const classified = classifyRow(rowCells);
    if (classified.kind === 'item') lineItems.push(classified.lineItem);
  }

  if (lineItems.length === 0) {
    return {
      lineItems: [],
      extractionError: 'Table header found but no line items under it',
    };
  }
  return { lineItems };
}

/** Cell texts of a row as a dense 0-based array (exceljs columns are 1-based). */
function rowTexts(row: Row): string[] {
  const texts: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    texts[columnNumber - 1] = cellText(cell.value);
  });
  return Array.from(texts, (text) => text ?? '');
}

function cellsOf(texts: string[], header: HeaderColumns): RowCells {
  const cells: RowCells = {};
  for (const [column, index] of Object.entries(header) as [
    InvoiceColumn,
    number,
  ][]) {
    const text = texts[index];
    if (text !== undefined && text !== '') cells[column] = text;
  }
  return cells;
}

/** Flattens every exceljs cell value kind to the text a person would see. */
function cellText(value: CellValue): string {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return '';
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  if ('formula' in value || 'sharedFormula' in value) {
    return cellText(value.result);
  }
  if ('hyperlink' in value) {
    return typeof value.text === 'string' ? value.text : cellText(value.text);
  }
  return '';
}
