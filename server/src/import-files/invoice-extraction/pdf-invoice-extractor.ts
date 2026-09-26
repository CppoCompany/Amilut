import PDFParser, { type Output, type Page, type Text } from 'pdf2json';
import { InvoiceExtractionResult, InvoiceLineItem } from './invoice-line-item';
import {
  classifyRow,
  detectHeaderColumns,
  HeaderColumns,
  InvoiceColumn,
  normalizeText,
  RowCells,
} from './invoice-table';

/**
 * `parseBuffer(buffer, verbosity)` coerces `0` to `1` (`verbosity || 1`) but
 * clamps negatives to `0`, which is the only way to silence pdf.js warnings
 * ("Setting up fake worker", "TT: undefined function") on the console.
 */
const PDF2JSON_QUIET = -1;
const PARSE_TIMEOUT_MS = 30_000;
/**
 * Text runs whose `y` differ by at most this much (pdf2json page units, one
 * unit is 16pt) belong to the same table row. Rows on a typical invoice are
 * ~0.8 units apart.
 */
const ROW_Y_TOLERANCE = 0.3;

/** One positioned piece of text from the PDF text layer. */
interface TextRun {
  x: number;
  y: number;
  text: string;
}

interface TextRow {
  y: number;
  runs: TextRun[];
}

/**
 * Where the table columns sit horizontally, derived from the header cells:
 * `columns` sorted left to right and `boundaries[i]` the midpoint between
 * column `i` and `i + 1`. Any run left of the first boundary belongs to the
 * first column, any run right of the last one to the last column.
 */
interface ColumnLayout {
  columns: InvoiceColumn[];
  boundaries: number[];
}

/**
 * Extracts the goods table from a text-layer PDF. Every page is scanned for a
 * header row (headers usually repeat per page; a page without one reuses the
 * previous layout), each text run below it is assigned to the column whose
 * header it sits under, runs are grouped into rows by `y`, and rows whose
 * quantity / price / total parse as numbers become line items. A footer row
 * (numeric total, no quantity — "Total USD $33,120.02") ends the page.
 *
 * @throws Error — the buffer is not a readable PDF (caller turns this into
 *   `extractionError`).
 */
export async function extractPdfInvoice(
  buffer: Buffer,
): Promise<InvoiceExtractionResult> {
  const pdf = await parsePdf(buffer);
  const lineItems: InvoiceLineItem[] = [];
  let layout: ColumnLayout | null = null;

  for (const page of pdf.Pages ?? []) {
    const rows = groupRows(textRuns(page));
    let firstDataRow = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const header = detectHeaderColumns(rows[i].runs.map((run) => run.text));
      if (header) {
        layout = buildLayout(rows[i], header);
        firstDataRow = i + 1;
        break;
      }
    }
    if (!layout) continue;

    for (const row of rows.slice(firstDataRow)) {
      const classified = classifyRow(cellsOf(row, layout));
      if (classified.kind === 'item') {
        lineItems.push(classified.lineItem);
      } else if (classified.kind === 'footer') {
        break;
      }
    }
  }

  if (!layout) {
    return { lineItems: [], extractionError: 'No line-item table found' };
  }
  if (lineItems.length === 0) {
    return {
      lineItems: [],
      extractionError: 'Table header found but no line items under it',
    };
  }
  return { lineItems };
}

/** Runs pdf2json over the buffer; rejects on parse errors or after a timeout. */
function parsePdf(buffer: Buffer): Promise<Output> {
  return new Promise<Output>((resolve, reject) => {
    const parser = new PDFParser(null, false);
    let settled = false;
    const timer = setTimeout(() => {
      finish(() => reject(new Error('PDF parsing timed out')));
    }, PARSE_TIMEOUT_MS);
    timer.unref();

    function finish(outcome: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outcome();
      try {
        parser.destroy();
      } catch {
        // Best effort: releases pdf.js document state; nothing to report.
      }
    }

    parser.on('pdfParser_dataError', (err) => {
      finish(() => reject(toError(err)));
    });
    parser.on('pdfParser_dataReady', (data) => {
      finish(() => resolve(data));
    });
    try {
      parser.parseBuffer(buffer, PDF2JSON_QUIET);
    } catch (err) {
      finish(() => reject(toError(err)));
    }
  });
}

/** pdf2json reports errors as `{ parserError: Error | string }` or a bare Error. */
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  const inner = (err as { parserError?: unknown } | null)?.parserError;
  if (inner instanceof Error) return inner;
  if (typeof inner === 'string' && inner !== '') return new Error(inner);
  return new Error('PDF could not be parsed');
}

function textRuns(page: Page): TextRun[] {
  const runs: TextRun[] = [];
  for (const text of page.Texts ?? []) {
    const value = normalizeText(decodeText(text));
    if (value !== '') runs.push({ x: text.x, y: text.y, text: value });
  }
  return runs;
}

/** pdf2json URI-encodes every run; fall back to the raw text if it is malformed. */
function decodeText(text: Text): string {
  return (text.R ?? [])
    .map((run) => {
      try {
        return decodeURIComponent(run.T);
      } catch {
        return run.T;
      }
    })
    .join('');
}

/** Groups runs into rows by `y` (top to bottom), each row sorted left to right. */
function groupRows(runs: TextRun[]): TextRow[] {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TextRow[] = [];
  for (const run of sorted) {
    const current = rows[rows.length - 1];
    if (current && run.y - current.y <= ROW_Y_TOLERANCE) {
      current.runs.push(run);
    } else {
      rows.push({ y: run.y, runs: [run] });
    }
  }
  for (const row of rows) row.runs.sort((a, b) => a.x - b.x);
  return rows;
}

function buildLayout(header: TextRow, columns: HeaderColumns): ColumnLayout {
  const anchors = (Object.entries(columns) as [InvoiceColumn, number][])
    .map(([column, index]) => ({ column, x: header.runs[index].x }))
    .sort((a, b) => a.x - b.x);
  const boundaries: number[] = [];
  for (let i = 1; i < anchors.length; i += 1) {
    boundaries.push((anchors[i - 1].x + anchors[i].x) / 2);
  }
  return { columns: anchors.map((anchor) => anchor.column), boundaries };
}

/**
 * Joins the runs of a row per column. A cell split over several runs by a
 * font change ("Y606/25P GD A" + "箱") is re-joined with a single space.
 */
function cellsOf(row: TextRow, layout: ColumnLayout): RowCells {
  const cells: RowCells = {};
  for (const run of row.runs) {
    const index = layout.boundaries.filter(
      (boundary) => run.x >= boundary,
    ).length;
    const column = layout.columns[index];
    cells[column] = cells[column] ? `${cells[column]} ${run.text}` : run.text;
  }
  return cells;
}
