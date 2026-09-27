import { InvoiceLineItem } from './invoice-line-item';

/** The five columns every extractor tries to locate in the goods table. */
export type InvoiceColumn = keyof InvoiceLineItem;

/** Which cell (by index) holds each recognised column of a header row. */
export type HeaderColumns = Partial<Record<InvoiceColumn, number>>;

/** Text of one table row keyed by column; columns with no text are absent. */
export type RowCells = Partial<Record<InvoiceColumn, string>>;

/**
 * Header-cell synonyms, case-insensitive. Order matters: the first matching
 * column wins, so the more specific words ("Total Price", "Unit Price",
 * "Item Description") are tested before the generic ones.
 */
const HEADER_SYNONYMS: ReadonlyArray<readonly [InvoiceColumn, RegExp]> = [
  ['total', /total|amount|value/i],
  ['quantity', /qty|quant|pcs/i],
  ['price', /price|unit|rate/i],
  ['description', /desc|goods|product|name/i],
  ['item', /item|part|sku|model|code|art/i],
];

/** `$1,518.92`, `1,518.92`, `1518.92`, `-3.5`, `USD 12`, `12 ₪`. */
const AMOUNT_RE = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const CURRENCY_RE = /[$€£₪¥]|\b(?:usd|eur|ils|nis|gbp|cny|rmb)\b/gi;

/** Trims and collapses runs of whitespace (including NBSP) to one space. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Parses a numeric cell as printed on an invoice. Returns `null` for anything
 * that is not a plain number once currency marks, thousands separators and
 * whitespace are removed (`Total`, `USD`, `15 PCS`, dates, item codes).
 */
export function parseAmount(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const cleaned = text.replace(CURRENCY_RE, '').replace(/\s+/g, '');
  if (!AMOUNT_RE.test(cleaned)) return null;
  const value = Number(cleaned.replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

/**
 * Recognises a table header from its cell texts. Returns the cell index of
 * each column found, or `null` when the row is not a usable header: a header
 * needs at least quantity + price + total, or item + quantity + total, each
 * in a distinct cell.
 */
export function detectHeaderColumns(
  cells: readonly string[],
): HeaderColumns | null {
  const columns: HeaderColumns = {};
  cells.forEach((cell, index) => {
    const text = normalizeText(cell);
    if (text === '' || parseAmount(text) !== null) return;
    const match = HEADER_SYNONYMS.find(
      ([column, pattern]) =>
        columns[column] === undefined && pattern.test(text),
    );
    if (match) columns[match[0]] = index;
  });
  return isUsableHeader(columns) ? columns : null;
}

function isUsableHeader(columns: HeaderColumns): boolean {
  const has = (column: InvoiceColumn) => columns[column] !== undefined;
  return has('quantity') && has('total') && (has('price') || has('item'));
}

export type RowKind =
  /** A goods line: quantity, price and total are all numbers. */
  | { kind: 'item'; lineItem: InvoiceLineItem }
  /** A footer such as `Total USD $33,120.02`: a total with no quantity. */
  | { kind: 'footer' }
  /** Anything else (blank, notes, page numbers, wrapped text). */
  | { kind: 'skip' };

/**
 * Classifies one row found below a header. Numbers are mandatory in the
 * quantity, price and total cells for a line item; a numeric total whose
 * quantity is not a number marks the end of the table (grand total line).
 */
export function classifyRow(cells: RowCells): RowKind {
  const quantity = parseAmount(cells.quantity);
  const price = parseAmount(cells.price);
  const total = parseAmount(cells.total);
  const item = normalizeText(cells.item ?? '');
  const description = normalizeText(cells.description ?? '');

  if (
    quantity !== null &&
    price !== null &&
    total !== null &&
    (item !== '' || description !== '')
  ) {
    return {
      kind: 'item',
      lineItem: { item, description, quantity, price, total },
    };
  }
  if (total !== null && quantity === null) {
    return { kind: 'footer' };
  }
  return { kind: 'skip' };
}
