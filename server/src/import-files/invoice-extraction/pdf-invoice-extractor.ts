import { groupRows, parsePdf, textRuns, TextRow } from '../pdf-text';
import { InvoiceExtractionResult, InvoiceLineItem } from './invoice-line-item';
import {
  classifyRow,
  detectHeaderColumns,
  HeaderColumns,
  InvoiceColumn,
  RowCells,
} from './invoice-table';

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
