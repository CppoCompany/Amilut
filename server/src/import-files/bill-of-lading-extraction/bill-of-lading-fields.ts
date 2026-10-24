import { DocCell, DocPage } from './document-model';

/**
 * The labelled boxes a bill of lading prints. `vesselVoyage` and
 * `placeDateOfIssue` are the combined boxes some forms use ("Vessel /
 * Voyage", "Place / Date of Issue"); `blNumber` is a bare "B/L No." whose
 * meaning (master or house) depends on the document it is on; `heading` is
 * any section title that only serves to end the value before it.
 */
export type BlField =
  | 'mblNumber'
  | 'hblNumber'
  | 'blNumber'
  | 'bookingNumber'
  | 'carrierName'
  | 'vesselVoyage'
  | 'vesselName'
  | 'voyageNumber'
  | 'portOfLoading'
  | 'portOfDischarge'
  | 'finalDestination'
  | 'shipper'
  | 'consignee'
  | 'notifyParty'
  | 'seller'
  | 'buyer'
  | 'containerNumber'
  | 'sealNumber'
  | 'freight'
  | 'receiptDelivery'
  | 'placeDateOfIssue'
  | 'placeOfIssue'
  | 'dateOfIssue'
  | 'totalPackages'
  | 'grossWeight'
  | 'measurement'
  | 'cargoDescription'
  | 'quantity'
  | 'marks'
  | 'heading';

/** Optional "(POL)"-style qualifier, then the colon/period that ends a label. */
const LABEL_TAIL = String.raw`(?:\s*\([^)]*\))?\s*[:.]*\s*`;
const NO = String.raw`(?:\s*(?:no\.?|nos\.?|number|num\.?|#|ref\.?|reference))?`;

function label(words: string): RegExp {
  // The label must end at a word boundary: "HBL-NGB-…" is a value, not an "HBL" label.
  return new RegExp(`^(?:${words})(?=$|[\\s:.(])${LABEL_TAIL}`, 'i');
}

/**
 * Label synonyms, case-insensitive, matched at the start of a cell. Order
 * matters: the first match wins, so compound labels ("House B/L No.",
 * "Vessel / Voyage", "Place / Date of Issue") come before the bare ones
 * they contain.
 */
const LABELS: ReadonlyArray<readonly [BlField, RegExp]> = [
  [
    'hblNumber',
    label(
      String.raw`(?:house|h\.?)\s*(?:bill\s*of\s*lading|b\/l|bl)${NO}|hbl${NO}`,
    ),
  ],
  [
    'mblNumber',
    label(
      String.raw`(?:master|m\.?)\s*(?:bill\s*of\s*lading|b\/l|bl)${NO}|mbl${NO}|m-?b\/l${NO}`,
    ),
  ],
  ['blNumber', label(String.raw`(?:bill\s*of\s*lading|b\/l|bl)${NO}`)],
  ['bookingNumber', label(String.raw`(?:booking|bkg)${NO}`)],
  [
    'carrierName',
    label(String.raw`(?:ocean\s*)?carrier(?:\s*name)?|shipping\s*line`),
  ],
  [
    'vesselVoyage',
    label(
      String.raw`vessel(?:\s*name)?\s*(?:\/|&|and|-)\s*voy(?:age)?\.?${NO}`,
    ),
  ],
  ['vesselName', label(String.raw`vessel(?:\s*name)?|ocean\s*vessel`)],
  ['voyageNumber', label(String.raw`voy(?:age)?\.?${NO}`)],
  [
    'portOfLoading',
    label(String.raw`port\s*of\s*loading|pol|place\s*of\s*receipt`),
  ],
  ['portOfDischarge', label(String.raw`port\s*of\s*discharge|pod`)],
  [
    'finalDestination',
    label(String.raw`final\s*destination|place\s*of\s*delivery|destination`),
  ],
  ['shipper', label(String.raw`shipper(?:\s*\/?\s*exporter)?`)],
  ['consignee', label(String.raw`consignee`)],
  ['notifyParty', label(String.raw`notify(?:\s*party|\s*address)?`)],
  // Invoice parties, read for the addresses a bill of lading leaves out.
  // "Seller and buyer" is a section heading, not the seller's box;
  // "Supplier" only as a whole label, not "Supplier Invoice …".
  [
    'heading',
    label(
      String.raw`(?:seller|supplier|exporter)\s*(?:and|&|\/)\s*(?:buyer|importer)`,
    ),
  ],
  [
    'seller',
    label(
      String.raw`seller|exporter|vendor|beneficiary|sold\s*by|supplier(?=\s*[:.]|\s*$)`,
    ),
  ],
  [
    'buyer',
    label(
      String.raw`buyer|importer|purchaser|bill\s*to|sold\s*to|invoice\s*to|ship\s*to`,
    ),
  ],
  [
    'containerNumber',
    label(String.raw`(?:container|cntr|cont)${NO}(?:\s*\/\s*seal${NO})?`),
  ],
  ['sealNumber', label(String.raw`seal${NO}`)],
  [
    'freight',
    label(
      String.raw`freight(?:\s*(?:status|terms|payable(?:\s*at)?|&\s*charges|and\s*charges))?`,
    ),
  ],
  [
    'receiptDelivery',
    label(
      String.raw`receipt\s*\/?\s*delivery(?:\s*type)?|service\s*type|movement(?:\s*type)?`,
    ),
  ],
  [
    'placeDateOfIssue',
    label(String.raw`place\s*(?:\/|&|and)\s*date\s*of\s*issue`),
  ],
  ['placeOfIssue', label(String.raw`place\s*of\s*issue`)],
  ['dateOfIssue', label(String.raw`date\s*of\s*issue`)],
  [
    'totalPackages',
    label(
      String.raw`total\s*(?:no\.?\s*of\s*|number\s*of\s*)?(?:pkgs|packages)`,
    ),
  ],
  ['grossWeight', label(String.raw`gross\s*weight|g\.?\s*w\.?|weight`)],
  ['measurement', label(String.raw`measurement|volume|cbm`)],
  [
    'cargoDescription',
    label(
      String.raw`(?:no\.?\s*of\s*pkgs\s*(?:&|and)\s*)?description(?:\s*of\s*(?:goods|packages\s*and\s*goods))?`,
    ),
  ],
  [
    'quantity',
    label(
      String.raw`no\.?\s*(?:&|and)?\s*kind\s*of\s*packages|no\.?\s*of\s*(?:pkgs|packages)|number\s*of\s*packages|packages|quantity|qty`,
    ),
  ],
  ['marks', label(String.raw`marks\s*(?:&|and)\s*(?:numbers|nos\.?)|marks`)],
  [
    'heading',
    label(
      String.raw`cargo\s*(?:details|particulars)|particulars|authori[sz]ed\s*signature|signature|drafting\s*note|notes?\b|remarks?\b|terms\b|declared\s*value|delivery\s*agent|forwarding|master\s*reference|on\s*board|shipped\s*on\s*board|(?:no\.?|number)\s*of\s*originals?|originals?\b|internal\s*(?:draft|working)|page\b|total\b`,
    ),
  ],
];

/** A cell recognised as a label, with whatever text followed the label in the same cell. */
export interface LabelMatch {
  field: BlField;
  remainder: string;
}

/**
 * Recognises a label at the start of a cell's first line. Text left in the
 * cell after the label ("Seal: SL-332211" → "SL-332211") is the inline
 * value. A long remainder means the cell is prose that merely starts with a
 * label word, not a labelled box.
 */
export function matchLabel(text: string): LabelMatch | null {
  const firstLine = text.split('\n')[0];
  for (const [field, pattern] of LABELS) {
    const match = pattern.exec(firstLine);
    if (!match) continue;
    const remainder = text.slice(match[0].length).trim();
    const endsWithPunctuation = /[:.]\s*$/.test(match[0]);
    if (remainder.length > 60 && !endsWithPunctuation) return null;
    return { field, remainder };
  }
  return null;
}

export function isLabelCell(cell: DocCell): boolean {
  return matchLabel(cell.text) !== null;
}

/** One occurrence of a field's label in the document, in reading order. */
export interface LabelOccurrence {
  field: BlField;
  page: number;
  row: number;
  cell: number;
  remainder: string;
}

export function findLabels(pages: DocPage[]): LabelOccurrence[] {
  const found: LabelOccurrence[] = [];
  pages.forEach((page, pageIndex) => {
    page.rows.forEach((row, rowIndex) => {
      row.cells.forEach((cell, cellIndex) => {
        const match = matchLabel(cell.text);
        if (match && match.field !== 'heading') {
          found.push({
            field: match.field,
            page: pageIndex,
            row: rowIndex,
            cell: cellIndex,
            remainder: match.remainder,
          });
        }
      });
    });
  });
  return found;
}

/** Horizontal slack when deciding whether a cell below sits under a label (PDF units / cell indices). */
const COLUMN_TOLERANCE = 0.5;

/**
 * The lines of text that belong to one labelled box, in reading order:
 * whatever followed the label inside its own cell, the cells to its right
 * on the same row up to the next label, and — when `rowsBelow` allows — the
 * cells underneath it (same column) on the following rows until a label
 * or an empty column is reached. A single-value field looks below only when
 * nothing was found beside the label (the value printed under its title);
 * a party box (shipper / consignee / notify) always does, since its address
 * runs on for several lines.
 */
export function collectValue(
  pages: DocPage[],
  at: LabelOccurrence,
  rowsBelow: number,
): string[] {
  const page = pages[at.page];
  const row = page.rows[at.row];
  const labelCell = row.cells[at.cell];
  const lines: string[] = [];

  if (at.remainder !== '') lines.push(...splitLines(at.remainder));

  let rightBound = Number.POSITIVE_INFINITY;
  for (let i = at.cell + 1; i < row.cells.length; i += 1) {
    const cell = row.cells[i];
    if (isLabelCell(cell) && !isValueOf(at.field, cell)) {
      rightBound = cell.x;
      break;
    }
    if (i === at.cell + 1) rightBound = Number.POSITIVE_INFINITY;
    lines.push(...splitLines(cell.text));
  }
  // The next cell to the right (label or not) bounds the column below.
  const nextCell = row.cells[at.cell + 1];
  const columnRight = nextCell ? Math.min(rightBound, nextCell.x) : rightBound;

  const besideFound = lines.length > 0;
  const maxBelow = besideFound && rowsBelow <= 1 ? 0 : rowsBelow;
  const columnLeft = labelCell.x - COLUMN_TOLERANCE;
  for (
    let r = at.row + 1;
    r <= at.row + maxBelow && r < page.rows.length;
    r += 1
  ) {
    const below = page.rows[r].cells.filter(
      (cell) => cell.x >= columnLeft && cell.x < columnRight,
    );
    if (below.length === 0) break;
    if (below.some(isLabelCell)) break;
    for (const cell of below) lines.push(...splitLines(cell.text));
  }

  return lines;
}

/**
 * A cell beside a label that reads as the same label with text after it is
 * that label's value, not a new box: "Freight terms | Freight Prepaid",
 * "Container No. | Container TGHU1234567".
 */
function isValueOf(field: BlField, cell: DocCell): boolean {
  const match = matchLabel(cell.text);
  return match !== null && match.field === field && match.remainder !== '';
}

/** Lines of a cell; a literal `<br>` printed into a PDF counts as a line break too. */
function splitLines(text: string): string[] {
  return text
    .split(/\n|<br\s*\/?>/i)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

// ── Value cleaning ─────────────────────────────────────────────────────────────

/** Form filler text that means "nothing here". */
const PLACEHOLDER_RE =
  /^(?:to\s*be\s*(?:completed|advised|confirmed|filled)|not\s*(?:allocated|specified|stated|applicable|available)|n\s*\/?\s*a|none|nil|tbd|tba|same\s*as\s*above|as\s*above|[-_—–.·\s]*)(?:\b|$)/i;

export function isPlaceholder(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return true;
  const match = PLACEHOLDER_RE.exec(trimmed);
  return match !== null && match[0].length >= Math.min(trimmed.length, 3);
}

/** Drops placeholder lines and leading bullets; `[]` when nothing real is left. */
export function cleanLines(lines: readonly string[]): string[] {
  return lines
    .map((line) => line.replace(/^[•·*\-–—]\s*/, '').trim())
    .filter((line) => !isPlaceholder(line));
}

/** A document reference ("NGB-LCL-2026-7731", "BMOU4512398"): short, has a digit, no prose. */
export function isReference(text: string): boolean {
  return (
    text.length <= 40 &&
    /\d/.test(text) &&
    /^[A-Za-z0-9][A-Za-z0-9/_. -]*$/.test(text) &&
    text.split(' ').length <= 3
  );
}

/** First number in the text, thousands separators allowed ("8,950.00 KGS" → 8950). */
export function parseNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/.exec(text);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Finds a date in free text and returns it as `YYYY-MM-DD`, plus the text
 * with the date removed (the place in a "Place / Date of Issue" box).
 * Understands `2026-09-20`, `20/09/2026` (day first), `20.09.2026`,
 * `20 SEP 2026` and `Sep 20, 2026`.
 */
export function extractDate(text: string): {
  date: string | null;
  rest: string;
} {
  const patterns: ReadonlyArray<
    [RegExp, (m: RegExpExecArray) => [number, number, number]]
  > = [
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => [+m[1], +m[2], +m[3]]],
    [/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/, (m) => [+m[3], +m[2], +m[1]]],
    [
      /\b(\d{1,2})\s*(?:st|nd|rd|th)?[\s-]+([a-z]{3,9})\.?,?[\s-]+(\d{4})\b/i,
      (m) => [
        +m[3],
        MONTHS[m[2].slice(0, 4).toLowerCase()] ??
          MONTHS[m[2].slice(0, 3).toLowerCase()] ??
          0,
        +m[1],
      ],
    ],
    [
      /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i,
      (m) => [
        +m[3],
        MONTHS[m[1].slice(0, 4).toLowerCase()] ??
          MONTHS[m[1].slice(0, 3).toLowerCase()] ??
          0,
        +m[2],
      ],
    ],
  ];
  for (const [pattern, pick] of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const [year, month, day] = pick(match);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const rest = text
      .replace(match[0], ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,;:/-]+|[\s,;:/-]+$/g, '');
    return { date, rest };
  }
  return { date: null, rest: text.trim() };
}

/** Truncates to a column width, never cutting mid-word when avoidable. */
export function clip(text: string | null, max: number): string | null {
  if (text === null) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}
