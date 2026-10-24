import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { groupRows, parsePdf, textRuns } from './pdf-text';

const SMALL_PDF = path.join(
  __dirname,
  'bill-of-lading-extraction/__fixtures__/mbl-sample.pdf',
);

describe('parsePdf', () => {
  it('parses a Buffer that is a view into a larger pooled ArrayBuffer', async () => {
    // Node hands out small Buffers as slices of a shared 8 kB pool; pdf2json
    // used to read the whole pool from offset 0 and fail on the xref table.
    const bytes = readFileSync(SMALL_PDF);
    const pool = Buffer.alloc(bytes.length + 128);
    bytes.copy(pool, 64);
    const view = pool.subarray(64, 64 + bytes.length);
    expect(view.byteOffset).not.toBe(0);

    const output = await parsePdf(view);

    expect(output.Pages).toHaveLength(1);
    const rows = groupRows(textRuns(output.Pages[0]));
    expect(rows.map((row) => row.runs.map((run) => run.text))).toContainEqual([
      'Master B/L No.',
      'SAMPLE-MBL-778845',
    ]);
  });

  it('rejects bytes that are not a PDF', async () => {
    await expect(parsePdf(Buffer.from('not a pdf'))).rejects.toBeInstanceOf(
      Error,
    );
  });
});
