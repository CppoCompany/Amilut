import PDFParser, { type Output, type Page, type Text } from 'pdf2json';
import { normalizeText } from './invoice-extraction/invoice-table';

/**
 * `parseBuffer(buffer, verbosity)` coerces `0` to `1` (`verbosity || 1`) but
 * clamps negatives to `0`, which is the only way to silence pdf.js warnings
 * ("Setting up fake worker", "TT: undefined function") on the console.
 */
const PDF2JSON_QUIET = -1;
const PARSE_TIMEOUT_MS = 30_000;
/**
 * Text runs whose `y` differ by at most this much (pdf2json page units, one
 * unit is 16pt) belong to the same row. Rows on a typical document are
 * ~0.6-0.8 units apart.
 */
export const ROW_Y_TOLERANCE = 0.3;

/** One positioned piece of text from the PDF text layer. */
export interface TextRun {
  x: number;
  y: number;
  text: string;
}

/** The runs sharing one baseline, left to right. */
export interface TextRow {
  y: number;
  runs: TextRun[];
}

/** Runs pdf2json over the buffer; rejects on parse errors or after a timeout. */
export function parsePdf(buffer: Buffer): Promise<Output> {
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
      parser.parseBuffer(exactBytes(buffer), PDF2JSON_QUIET);
    } catch (err) {
      finish(() => reject(toError(err)));
    }
  });
}

/**
 * pdf2json's `parseBuffer` replaces a Buffer whose `byteLength` differs from
 * its underlying `ArrayBuffer` with a view over that whole ArrayBuffer from
 * offset 0. Node pools small Buffers (under 4 kB, e.g. a `readFile` of a short
 * PDF) inside a shared 8 kB ArrayBuffer, so such a PDF would be parsed from
 * the wrong bytes and fail with "Invalid XRef stream header". Hand it a copy
 * that owns its ArrayBuffer exactly.
 */
function exactBytes(buffer: Buffer): Buffer {
  if (buffer.byteOffset === 0 && buffer.buffer.byteLength === buffer.byteLength)
    return buffer;
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return Buffer.from(copy.buffer);
}

/** pdf2json reports errors as `{ parserError: Error | string }` or a bare Error. */
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  const inner = (err as { parserError?: unknown } | null)?.parserError;
  if (inner instanceof Error) return inner;
  if (typeof inner === 'string' && inner !== '') return new Error(inner);
  return new Error('PDF could not be parsed');
}

/** Every non-empty text run of a page, whitespace-normalised. */
export function textRuns(page: Page): TextRun[] {
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
export function groupRows(runs: TextRun[]): TextRow[] {
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
