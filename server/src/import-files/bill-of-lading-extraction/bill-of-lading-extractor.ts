import { PaymentTerms } from '../../orders/orders.enums';
import {
  HblDocumentExtractDto,
  MblContainerExtractDto,
  MblDocumentExtractDto,
} from '../dto/bill-of-lading-extract.dto';
import {
  BlField,
  cleanLines,
  clip,
  collectValue,
  extractDate,
  findLabels,
  isLabelCell,
  isPlaceholder,
  isReference,
  LabelOccurrence,
  matchLabel,
  parseNumber,
} from './bill-of-lading-fields';
import { DocCell, DocPage, DocRow } from './document-model';

// Column widths of `mbl` / `hbl` (migration 015), so a prefill never exceeds them.
const NAME_MAX = 200;
const ADDRESS_MAX = 500;
const DESCRIPTION_MAX = 500;
const REFERENCE_MAX = 50;
const PORT_MAX = 100;
const QUANTITY_MAX = 100;

/** ISO 6346 container number: four letters, seven digits ("BMOU4512398"). */
const CONTAINER_NUMBER_RE = /\b([A-Z]{4})\s?(\d{7})\b/;
const SEAL_RE = /seal\s*(?:no\.?|number|#)?\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{2,})/i;
/** "CY/CFS", "CFS TO CFS", "DOOR-CY" — the receipt/delivery service type. */
const SERVICE_TYPE_RE =
  /\b(CY|CFS|DOOR|SD)\s*(?:\/|-|TO)\s*(CY|CFS|DOOR|SD)\b/i;

/** Which bill of lading a document is, judged by its content. */
export type BillOfLadingKind = 'master' | 'house';

/**
 * Tells a Master B/L from a House B/L by content, for uploads filed under
 * the generic "Bill of Lading" type: a document with a "House B/L No." box
 * is a house B/L (even though it also quotes the master number); one whose
 * boxes or title speak only of the master is the master; anything else is
 * taken as the house B/L, the document a File is made from.
 */
export function classifyBillOfLading(pages: DocPage[]): BillOfLadingKind {
  const labels = findLabels(pages);
  if (labels.some((l) => l.field === 'hblNumber')) return 'house';
  if (labels.some((l) => l.field === 'mblNumber')) return 'master';
  const text = allText(pages).join('\n');
  if (/\bhouse\s+(?:bill\s+of\s+lading|b\/l)\b/i.test(text)) return 'house';
  if (/\bmaster\s+(?:bill\s+of\s+lading|b\/l)\b/i.test(text)) return 'master';
  return 'house';
}

/**
 * Reads the Job (MBL) fields out of a document. Works on a Master B/L and,
 * for the master-level boxes, on a House B/L too.
 */
export function extractMblDocument(pages: DocPage[]): MblDocumentExtractDto {
  const labels = findLabels(pages);
  const reader = new FieldReader(pages, labels);
  const hasHouseNumber = labels.some((l) => l.field === 'hblNumber');

  const { vesselName, voyageNumber } = readVesselVoyage(reader);
  const { placeOfIssue, dateOfIssue } = readIssue(reader);
  const shipper = reader.party('shipper');
  const consignee = reader.party('consignee');
  const notify = reader.party('notifyParty');

  const grossWeightKg = parseNumber(reader.single('grossWeight'));
  const volumeCbm = parseNumber(reader.single('measurement'));

  // A table with a container column lists the containers; a house B/L's
  // cargo table (packages / description only) is this consignment's goods,
  // not a container, so the container then comes from the labelled boxes.
  const records = cargoTableRecords(pages);
  let containers = records.some((record) => record.container !== undefined)
    ? records.map(toContainer).filter((c) => c.containerNumber !== null)
    : [];
  if (containers.length === 0) {
    const fromLabels = containerFromLabels(reader);
    if (fromLabels) containers = [fromLabels];
    else if (records.length === 1) {
      const only = toContainer(records[0]);
      if (only.cargoDescription !== null) containers = [only];
    }
  }
  if (containers.length === 1) {
    // One container carries the whole consignment: the document's cargo
    // table / totals describe it.
    const only = containers[0];
    const goods = records.length === 1 ? toContainer(records[0]) : null;
    if (only.cargoDescription === null) {
      only.cargoDescription = goods?.cargoDescription ?? null;
    }
    if (only.grossWeightKg === null) {
      only.grossWeightKg = goods?.grossWeightKg ?? grossWeightKg;
    }
    if (only.volumeCbm === null) {
      only.volumeCbm = goods?.volumeCbm ?? volumeCbm;
    }
  }

  return {
    mblNumber:
      reader.reference('mblNumber') ??
      (hasHouseNumber ? null : reader.reference('blNumber')),
    bookingNumber: reader.reference('bookingNumber'),
    vesselName: clip(vesselName, NAME_MAX),
    voyageNumber: clip(voyageNumber, REFERENCE_MAX),
    portOfLoading: clip(reader.single('portOfLoading'), PORT_MAX),
    portOfDischarge: clip(reader.single('portOfDischarge'), PORT_MAX),
    finalDestination: clip(reader.single('finalDestination'), PORT_MAX),
    carrierName: clip(reader.single('carrierName'), NAME_MAX),
    shipperName: shipper.name,
    shipperAddress: shipper.address,
    consigneeName: consignee.name,
    consigneeAddress: consignee.address,
    notifyPartyName: notify.name,
    notifyPartyAddress: notify.address,
    freightTerms: readFreightTerms(reader.single('freight')),
    receiptDeliveryType: readServiceType(
      reader.single('receiptDelivery'),
      pages,
    ),
    placeOfIssue: clip(placeOfIssue, PORT_MAX),
    dateOfIssue,
    totalPackages: clip(
      reader.single('totalPackages') ?? packagesFromTable(records),
      QUANTITY_MAX,
    ),
    grossWeightKg,
    volumeCbm,
    containers,
  };
}

/**
 * The packages column of the cargo table when no "Total packages" box
 * exists: the single record's text ("120 cartons"), the records' counts
 * summed when they share a unit ("26 PACKAGES"), else the texts joined.
 */
function packagesFromTable(records: readonly CargoRecord[]): string | null {
  const texts = records
    .map((record) => joinLines(record.packages, ' '))
    .filter((text): text is string => text !== null);
  if (texts.length === 0) return null;
  if (texts.length === 1) return texts[0];
  const parsed = texts.map((text) =>
    /^\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(.*)$/.exec(text),
  );
  if (parsed.every((m) => m !== null)) {
    const units = new Set(parsed.map((m) => m[2].trim().toLowerCase()));
    if (units.size === 1) {
      const total = parsed.reduce(
        (sum, m) => sum + Number(m[1].replace(/,/g, '')),
        0,
      );
      const unit = parsed[0][2].trim();
      return unit ? `${total} ${unit}` : String(total);
    }
  }
  return texts.join('; ');
}

/**
 * Reads the File (HBL) fields out of a document. A file holding several
 * house B/Ls (one per page, each with its own "House B/L No." box) yields
 * one result per house B/L; a page without that box continues the previous
 * one. A document with no such box at all is read as a single house B/L.
 */
export function extractHblDocuments(pages: DocPage[]): HblDocumentExtractDto[] {
  const candidates: DocPage[][] = [];
  for (const page of pages) {
    const startsHouseBl = page.rows.some((row) =>
      row.cells.some((cell) => matchLabel(cell.text)?.field === 'hblNumber'),
    );
    if (startsHouseBl || candidates.length === 0) candidates.push([page]);
    else candidates[candidates.length - 1].push(page);
  }
  return candidates.map(extractHblDocument);
}

function extractHblDocument(pages: DocPage[]): HblDocumentExtractDto {
  const labels = findLabels(pages);
  const reader = new FieldReader(pages, labels);
  const hasMasterNumber = labels.some((l) => l.field === 'mblNumber');

  const shipper = reader.party('shipper');
  const consignee = reader.party('consignee');
  const notify = reader.party('notifyParty');

  const record = cargoTableRecords(pages)[0] ?? null;
  const cargoDescription =
    joinLines(record?.description, ' ') ??
    joinLines(reader.lines('cargoDescription', 4), ' ');
  const quantity =
    joinLines(record?.packages, ' ') ??
    joinLines(reader.lines('quantity', 1), ' ');
  const remarks =
    joinLines(record?.marks, ' ') ?? joinLines(reader.lines('marks', 2), ' ');

  return {
    hblNumber:
      reader.reference('hblNumber') ??
      (hasMasterNumber ? null : reader.reference('blNumber')),
    shipperName: shipper.name,
    shipperAddress: shipper.address,
    consigneeName: consignee.name,
    consigneeAddress: consignee.address,
    notifyPartyName: notify.name,
    notifyPartyAddress: notify.address,
    cargoDescription: clip(cargoDescription, DESCRIPTION_MAX),
    quantity: clip(quantity, QUANTITY_MAX),
    grossWeightKg:
      parseNumber(joinLines(record?.weight, ' ')) ??
      parseNumber(reader.single('grossWeight')),
    volumeCbm:
      parseNumber(joinLines(record?.measurement, ' ')) ??
      parseNumber(reader.single('measurement')),
    remarks: clip(remarks, DESCRIPTION_MAX),
    master: extractMblDocument(pages),
  };
}

// ── Labelled boxes ─────────────────────────────────────────────────────────────

/** Reads fields by their labels: the first occurrence with a real value wins. */
export class FieldReader {
  constructor(
    private readonly pages: DocPage[],
    private readonly labels: readonly LabelOccurrence[],
  ) {}

  /** The cleaned lines of the first occurrence of `field` that has any. */
  lines(field: BlField, rowsBelow: number): string[] {
    for (const occurrence of this.labels) {
      if (occurrence.field !== field) continue;
      const lines = cleanLines(collectValue(this.pages, occurrence, rowsBelow));
      if (lines.length > 0) return lines;
    }
    return [];
  }

  /** A one-line box: the lines joined with a space. */
  single(field: BlField): string | null {
    return joinLines(this.lines(field, 1), ' ');
  }

  /** A document reference: the first occurrence whose value looks like one. */
  reference(field: BlField): string | null {
    for (const occurrence of this.labels) {
      if (occurrence.field !== field) continue;
      const lines = cleanLines(collectValue(this.pages, occurrence, 1));
      const value = lines[0];
      if (value !== undefined && isReference(value)) {
        return clip(value, REFERENCE_MAX);
      }
    }
    return null;
  }

  /** A party box: first line is the name, the rest the address. */
  party(field: BlField): { name: string | null; address: string | null } {
    const lines = this.lines(field, 4);
    return {
      name: clip(lines[0] ?? null, NAME_MAX),
      address: clip(joinLines(lines.slice(1), ', '), ADDRESS_MAX),
    };
  }
}

function joinLines(
  lines: readonly string[] | null | undefined,
  separator: string,
): string | null {
  if (!lines) return null;
  const cleaned = cleanLines(lines);
  return cleaned.length > 0 ? cleaned.join(separator) : null;
}

function readVesselVoyage(reader: FieldReader): {
  vesselName: string | null;
  voyageNumber: string | null;
} {
  const combined = reader.single('vesselVoyage');
  if (combined !== null) {
    const bySlash = combined.split('/');
    if (bySlash.length >= 2) {
      return {
        vesselName: bySlash[0].trim() || null,
        voyageNumber: bySlash.slice(1).join('/').trim() || null,
      };
    }
    const byVoy = /^(.*?)\s+V(?:OY)?\.?\s*([A-Z0-9-]+)$/i.exec(combined);
    if (byVoy) return { vesselName: byVoy[1].trim(), voyageNumber: byVoy[2] };
    return {
      vesselName: combined,
      voyageNumber: reader.single('voyageNumber'),
    };
  }
  return {
    vesselName: reader.single('vesselName'),
    voyageNumber: reader.single('voyageNumber'),
  };
}

function readIssue(reader: FieldReader): {
  placeOfIssue: string | null;
  dateOfIssue: string | null;
} {
  let placeOfIssue = reader.single('placeOfIssue');
  let dateOfIssue: string | null = null;
  const dateText = reader.single('dateOfIssue');
  if (dateText !== null) dateOfIssue = extractDate(dateText).date;

  const combined = reader.single('placeDateOfIssue');
  if (combined !== null) {
    const { date, rest } = extractDate(combined);
    if (dateOfIssue === null) dateOfIssue = date;
    if (placeOfIssue === null && rest !== '' && !isPlaceholder(rest)) {
      placeOfIssue = rest;
    }
  }
  return { placeOfIssue, dateOfIssue };
}

function readFreightTerms(text: string | null): PaymentTerms | null {
  if (text === null) return null;
  if (/prepaid|pre-paid|ppd/i.test(text)) return PaymentTerms.PREPAID;
  if (/collect/i.test(text)) return PaymentTerms.COLLECT;
  return null;
}

/** "CY/CFS" from the labelled box, else from anywhere in the document ("CFS TO CFS" in the marks). */
function readServiceType(
  labelled: string | null,
  pages: DocPage[],
): string | null {
  const candidates = labelled !== null ? [labelled] : allText(pages);
  for (const text of candidates) {
    const match = SERVICE_TYPE_RE.exec(text);
    if (match) return `${match[1].toUpperCase()}/${match[2].toUpperCase()}`;
  }
  return labelled !== null ? clip(labelled, 20) : null;
}

function allText(pages: DocPage[]): string[] {
  return pages.flatMap((page) =>
    page.rows.flatMap((row) => row.cells.map((cell) => cell.text)),
  );
}

function containerFromLabels(
  reader: FieldReader,
): MblContainerExtractDto | null {
  const containerText = reader.single('containerNumber');
  const containerNumber = containerText
    ? (CONTAINER_NUMBER_RE.exec(containerText.toUpperCase())?.[0] ?? null)
    : null;
  const sealText = reader.single('sealNumber');
  const containerSealNumber =
    (containerText && SEAL_RE.exec(containerText)?.[1]) ||
    (containerText &&
      containerNumber &&
      sealBeside(containerText, containerNumber)) ||
    (sealText && (SEAL_RE.exec(`seal ${sealText}`)?.[1] ?? null)) ||
    null;
  if (containerNumber === null && containerSealNumber === null) return null;
  return {
    containerNumber: containerNumber?.replace(/\s/g, '') ?? null,
    containerSealNumber: clip(containerSealNumber, 30),
    cargoDescription: null,
    grossWeightKg: null,
    volumeCbm: null,
  };
}

/**
 * The seal printed next to the container number in one box
 * ("TGHU1234567 / SEAL-DEMO-88421", "BMOU4512398 SL-332211"): the
 * reference-like token that follows the container number.
 */
function sealBeside(text: string, containerNumber: string): string | null {
  const index = text.toUpperCase().indexOf(containerNumber);
  if (index < 0) return null;
  const rest = text
    .slice(index + containerNumber.length)
    .replace(/^[\s/,;:|-]+/, '')
    .replace(/^seal(?:\s*(?:no\.?|number|#))?(?=[\s:.])\s*[:.]?\s*/i, '');
  const token = /^([A-Z0-9][A-Z0-9-]{2,})/i.exec(rest)?.[1] ?? null;
  return token && /\d/.test(token) ? token : null;
}

// ── Cargo table ────────────────────────────────────────────────────────────────

type CargoColumn =
  | 'container'
  | 'seal'
  | 'marks'
  | 'packages'
  | 'description'
  | 'weight'
  | 'measurement';

/** Lines of text per column of one cargo-table record (one container, or the whole table). */
type CargoRecord = Partial<Record<CargoColumn, string[]>>;

const COLUMN_PATTERNS: ReadonlyArray<readonly [CargoColumn, RegExp]> = [
  ['container', /container|cntr/i],
  ['seal', /^seal/i],
  ['weight', /gross|weight|\bkgs?\b/i],
  ['measurement', /measurement|volume|\bcbm\b|\bm3\b|cubic/i],
  ['marks', /marks/i],
  ['description', /description|goods/i],
  ['packages', /pkgs|packages|package|quantity|\bqty\b|kind\s*of/i],
];

function columnOf(text: string): CargoColumn | null {
  const firstLine = text.split('\n')[0];
  const matches = COLUMN_PATTERNS.filter(([, pattern]) =>
    pattern.test(firstLine),
  ).map(([column]) => column);
  if (matches.length === 0) return null;
  // "No. of Pkgs & Description of Goods" is one column holding both — the description.
  if (matches.includes('description') && matches.includes('packages'))
    return 'description';
  return matches[0];
}

interface CargoLayout {
  columns: CargoColumn[];
  boundaries: number[];
}

/** A header row names at least two cargo columns, one of them about the goods themselves. */
function detectCargoHeader(row: DocRow): CargoLayout | null {
  const anchors: { column: CargoColumn; x: number }[] = [];
  for (const cell of row.cells) {
    const column = columnOf(cell.text);
    if (column && !anchors.some((a) => a.column === column)) {
      anchors.push({ column, x: cell.x });
    }
  }
  const aboutGoods = anchors.some((a) =>
    ['packages', 'description', 'weight', 'measurement'].includes(a.column),
  );
  if (anchors.length < 2 || !aboutGoods) return null;
  anchors.sort((a, b) => a.x - b.x);
  const boundaries: number[] = [];
  for (let i = 1; i < anchors.length; i += 1) {
    boundaries.push((anchors[i - 1].x + anchors[i].x) / 2);
  }
  return { columns: anchors.map((a) => a.column), boundaries };
}

function isHeaderContinuation(row: DocRow): boolean {
  return row.cells.every((cell) => columnOf(cell.text) !== null);
}

/** A row that ends the table: a labelled box, a heading, a totals line or a paragraph of notes. */
function isTerminator(row: DocRow): boolean {
  return row.cells.some(
    (cell) =>
      isLabelCell(cell) ||
      /^(?:total|sub-?total|grand total)\b/i.test(cell.text) ||
      (row.cells.length === 1 && cell.text.length > 100),
  );
}

function columnAt(layout: CargoLayout, cell: DocCell): CargoColumn {
  const index = layout.boundaries.filter(
    (boundary) => cell.x >= boundary,
  ).length;
  return layout.columns[index];
}

/**
 * The records of the first cargo table in the document: the rows under a
 * recognised header, grouped into one record per container (a new record
 * starts at every row whose container cell holds a container number) or a
 * single record when the table has no container column.
 */
export function cargoTableRecords(pages: DocPage[]): CargoRecord[] {
  for (const page of pages) {
    for (let i = 0; i < page.rows.length; i += 1) {
      const layout = detectCargoHeader(page.rows[i]);
      if (!layout) continue;
      let start = i + 1;
      while (
        start < page.rows.length &&
        isHeaderContinuation(page.rows[start])
      ) {
        start += 1;
      }
      const records: CargoRecord[] = [];
      let current: CargoRecord | null = null;
      for (const row of page.rows.slice(start)) {
        if (isTerminator(row)) break;
        const cells = row.cells.map((cell) => ({
          column: columnAt(layout, cell),
          cell,
        }));
        const startsRecord =
          current === null ||
          cells.some(
            ({ column, cell }) =>
              column === 'container' &&
              CONTAINER_NUMBER_RE.test(cell.text.toUpperCase()),
          );
        if (startsRecord) {
          current = {};
          records.push(current);
        }
        for (const { column, cell } of cells) {
          const lines = cell.text.split('\n').map((line) => line.trim());
          current![column] = [...(current![column] ?? []), ...lines];
        }
      }
      return records;
    }
  }
  return [];
}

function toContainer(record: CargoRecord): MblContainerExtractDto {
  const containerText = (record.container ?? []).join(' ');
  const containerNumber = CONTAINER_NUMBER_RE.exec(containerText.toUpperCase());
  const seal =
    SEAL_RE.exec(containerText)?.[1] ??
    (record.seal
      ? SEAL_RE.exec(`seal ${record.seal.join(' ')}`)?.[1]
      : undefined) ??
    null;
  return {
    containerNumber: containerNumber
      ? `${containerNumber[1]}${containerNumber[2]}`
      : null,
    containerSealNumber: clip(seal, 30),
    cargoDescription: clip(
      joinLines(record.description, '; '),
      DESCRIPTION_MAX,
    ),
    grossWeightKg: parseNumber(joinLines(record.weight, ' ')),
    volumeCbm: parseNumber(joinLines(record.measurement, ' ')),
  };
}
