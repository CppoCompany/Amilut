import { Injectable, Logger } from '@nestjs/common';
import * as path from 'node:path';
import {
  InvoiceExtractionResult,
  InvoiceExtractorInput,
} from './invoice-line-item';
import { extractPdfInvoice } from './pdf-invoice-extractor';
import { extractXlsxInvoice } from './xlsx-invoice-extractor';

export const UNSUPPORTED_FILE_TYPE_ERROR =
  'Unsupported file type for extraction';

/** Which extractor handles a file, decided from its extension, then its MIME type. */
export type ExtractableFileKind = 'pdf' | 'xlsx' | 'unsupported';

const KIND_BY_EXTENSION: Readonly<Record<string, ExtractableFileKind>> = {
  '.pdf': 'pdf',
  '.xlsx': 'xlsx',
  '.xlsm': 'xlsx',
  '.xls': 'xlsx',
};

const KIND_BY_MIME: Readonly<Record<string, ExtractableFileKind>> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
};

export function detectFileKind(file: {
  mimetype: string;
  originalname: string;
}): ExtractableFileKind {
  const extension = path.extname(file.originalname ?? '').toLowerCase();
  const mime = (file.mimetype ?? '').toLowerCase().split(';')[0].trim();
  return KIND_BY_EXTENSION[extension] ?? KIND_BY_MIME[mime] ?? 'unsupported';
}

/**
 * Pulls the goods table out of an uploaded supplier invoice. Pluggable per
 * file kind (PDF text layer, .xlsx workbook); anything else is reported as
 * unsupported. Never rejects: parser crashes become `extractionError` so an
 * upload is never failed by extraction.
 */
@Injectable()
export class InvoiceExtractorService {
  private readonly logger = new Logger(InvoiceExtractorService.name);

  async extract(file: InvoiceExtractorInput): Promise<InvoiceExtractionResult> {
    let result: InvoiceExtractionResult;
    try {
      result = await runExtractor(file);
    } catch (err) {
      result = { lineItems: [], extractionError: describeExtractionError(err) };
    }
    if (result.extractionError) {
      this.logger.warn(
        `No line items extracted from "${file.originalname}": ${result.extractionError}`,
      );
    }
    return result;
  }
}

function runExtractor(
  file: InvoiceExtractorInput,
): Promise<InvoiceExtractionResult> {
  switch (detectFileKind(file)) {
    case 'pdf':
      return extractPdfInvoice(file.buffer);
    case 'xlsx':
      return extractXlsxInvoice(file.buffer);
    default:
      return Promise.resolve({
        lineItems: [],
        extractionError: UNSUPPORTED_FILE_TYPE_ERROR,
      });
  }
}

/** Short, single-line reason suitable for storing next to the file descriptor. */
export function describeExtractionError(err: unknown): string {
  let raw = 'Extraction failed';
  if (err instanceof Error) raw = err.message;
  else if (typeof err === 'string') raw = err;
  const firstLine = raw
    .split(/\r?\n/, 1)[0]
    .replace(/^(Error:\s*)+/i, '')
    .trim();
  const message = firstLine === '' ? 'Extraction failed' : firstLine;
  return message.length > 200 ? `${message.slice(0, 197)}...` : message;
}
