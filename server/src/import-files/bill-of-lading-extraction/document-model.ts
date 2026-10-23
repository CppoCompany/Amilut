import * as path from 'node:path';
import { groupRows, parsePdf, textRuns } from '../pdf-text';

/**
 * A document reduced to positioned text cells, the common shape the
 * bill-of-lading extractor reads regardless of the file format:
 *
 * - a PDF page's rows are its text baselines, each run a cell with its real
 *   horizontal position (pdf2json page units);
 * - an HTML file is one page whose rows are block elements / table rows and
 *   whose cells are table cells or inline elements, `x` being the cell index;
 * - a plain-text file is one page, one row per line.
 *
 * A cell's text may hold several lines (`\n`) when the source cell did — an
 * HTML `<td>` with `<br>`s, for instance.
 */
export interface DocCell {
  text: string;
  x: number;
}

export interface DocRow {
  cells: DocCell[];
}

export interface DocPage {
  rows: DocRow[];
}

export type DocumentKind = 'pdf' | 'html' | 'text' | 'unsupported';

const KIND_BY_EXTENSION: Readonly<Record<string, DocumentKind>> = {
  '.pdf': 'pdf',
  '.html': 'html',
  '.htm': 'html',
  '.xhtml': 'html',
  '.txt': 'text',
  '.text': 'text',
};

const KIND_BY_MIME: Readonly<Record<string, DocumentKind>> = {
  'application/pdf': 'pdf',
  'text/html': 'html',
  'application/xhtml+xml': 'html',
  'text/plain': 'text',
};

export const UNSUPPORTED_DOCUMENT_ERROR =
  'Unsupported file type (PDF, HTML or plain text expected)';

/** Which reader handles a file, decided from its extension, then its MIME type. */
export function detectDocumentKind(
  name: string,
  mimeType: string,
): DocumentKind {
  const extension = path.extname(name ?? '').toLowerCase();
  const mime = (mimeType ?? '').toLowerCase().split(';')[0].trim();
  return KIND_BY_EXTENSION[extension] ?? KIND_BY_MIME[mime] ?? 'unsupported';
}

/**
 * Reads a file into pages of text cells.
 *
 * @throws Error — unsupported file type, or the bytes could not be parsed.
 */
export async function readDocument(
  buffer: Buffer,
  name: string,
  mimeType: string,
): Promise<DocPage[]> {
  switch (detectDocumentKind(name, mimeType)) {
    case 'pdf':
      return readPdfDocument(buffer);
    case 'html':
      return readHtmlDocument(buffer.toString('utf8'));
    case 'text':
      return readTextDocument(buffer.toString('utf8'));
    default:
      throw new Error(UNSUPPORTED_DOCUMENT_ERROR);
  }
}

/** Every page of a text-layer PDF, rows grouped by baseline, one cell per run. */
export async function readPdfDocument(buffer: Buffer): Promise<DocPage[]> {
  const pdf = await parsePdf(buffer);
  return (pdf.Pages ?? []).map((page) => ({
    rows: groupRows(textRuns(page)).map((row) => ({
      cells: row.runs.map((run) => ({ text: run.text, x: run.x })),
    })),
  }));
}

/** One row per non-empty line; tabs or runs of 3+ spaces split a line into cells. */
export function readTextDocument(text: string): DocPage[] {
  const rows: DocRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line
      .split(/\t+| {3,}/)
      .map((part) => collapseSpaces(part))
      .filter((part) => part !== '');
    if (cells.length > 0) {
      rows.push({ cells: cells.map((cell, x) => ({ text: cell, x })) });
    }
  }
  return [{ rows }];
}

// ── HTML ───────────────────────────────────────────────────────────────────────

/** Elements that start a new row when opened and closed. `br`/`hr` are void. */
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'caption',
  'dd',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'tr',
  'ul',
]);
/** Elements whose content is one cell (with inner line breaks kept as `\n`). */
const CELL_TAGS = new Set(['td', 'th']);
/** Elements whose content is not document text. */
const SKIP_TAGS = new Set([
  'head',
  'noscript',
  'script',
  'style',
  'svg',
  'template',
]);

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  bull: '•',
  middot: '·',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  copy: '©',
  reg: '®',
  deg: '°',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match: string, entity: string) => {
      if (entity[0] === '#') {
        const code =
          entity[1] === 'x' || entity[1] === 'X'
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Reduces an HTML document to rows of cells without a DOM: every block
 * element and `<br>` ends a row; inside a row, each table cell or inline
 * element (`<span>`, `<strong>`, …) is a cell, so "`<span>MBL NO.</span>
 * <strong>NGB-…</strong>`" yields a label cell followed by its value cell.
 * Inside a `<td>`/`<th>`, `<br>`s and nested blocks become line breaks of
 * that one cell instead of new rows, so a table row stays one row.
 */
export function readHtmlDocument(html: string): DocPage[] {
  const rows: DocRow[] = [];
  let current: DocRow = { cells: [] };
  let inline = '';
  let cellDepth = 0;
  let cellText = '';
  let skipDepth = 0;

  const flushInline = () => {
    const text = collapseSpaces(inline);
    inline = '';
    if (text !== '') current.cells.push({ text, x: current.cells.length });
  };
  const newRow = () => {
    flushInline();
    if (current.cells.length > 0) rows.push(current);
    current = { cells: [] };
  };
  const closeCell = () => {
    const text = cellText
      .split('\n')
      .map(collapseSpaces)
      .filter((line) => line !== '')
      .join('\n');
    cellText = '';
    if (text !== '') current.cells.push({ text, x: current.cells.length });
  };

  const tokens = html.replace(/<!--[\s\S]*?-->/g, '');
  const tagOrText = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>|[^<]+/g;
  let match: RegExpExecArray | null;
  while ((match = tagOrText.exec(tokens)) !== null) {
    const token = match[0];
    if (token[0] !== '<') {
      if (skipDepth > 0) continue;
      const text = decodeHtmlEntities(token);
      if (cellDepth > 0) cellText += text;
      else inline += text;
      continue;
    }

    const tag = match[1].toLowerCase();
    const closing = token[1] === '/';
    if (SKIP_TAGS.has(tag)) {
      skipDepth = Math.max(0, skipDepth + (closing ? -1 : 1));
      continue;
    }
    if (skipDepth > 0) continue;

    if (CELL_TAGS.has(tag)) {
      if (closing) {
        if (cellDepth > 0) {
          cellDepth -= 1;
          if (cellDepth === 0) closeCell();
        }
      } else {
        if (cellDepth === 0) flushInline();
        else cellText += '\n';
        cellDepth += 1;
      }
      continue;
    }

    if (BLOCK_TAGS.has(tag)) {
      if (cellDepth > 0) cellText += '\n';
      else newRow();
      continue;
    }

    // Inline element boundary — a new cell outside tables, nothing inside one.
    if (cellDepth === 0) flushInline();
  }

  newRow();
  return [{ rows }];
}
