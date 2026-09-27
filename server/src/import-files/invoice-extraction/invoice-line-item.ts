/**
 * One row of the goods table of a supplier invoice, as extracted from the
 * uploaded file. Stored inside `import_account_files.data.lineItems`.
 */
export interface InvoiceLineItem {
  /** Item / part / model code, e.g. `Y8022-140BK` (may contain spaces). */
  item: string;
  description: string;
  quantity: number;
  /** Unit price, currency stripped: `$1,518.92` → `1518.92`. */
  price: number;
  /** Line total, currency stripped. */
  total: number;
}

/**
 * Outcome of running an extractor over one file. Extraction never throws to
 * the caller: a file that cannot be parsed, or that holds no recognisable
 * table, yields an empty `lineItems` plus a short `extractionError`.
 */
export interface InvoiceExtractionResult {
  lineItems: InvoiceLineItem[];
  extractionError?: string;
}

/** The subset of a multer file an extractor needs. */
export interface InvoiceExtractorInput {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}
