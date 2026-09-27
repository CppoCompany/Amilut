import { inlineDisposition } from './import-files.controller';

// The controller pulls in the service, whose DatabaseService import drags in
// @nestjs/config (ESM-only). Only the pure header helper is under test here.
jest.mock('../database/database.service', () => ({
  DatabaseService: class DatabaseService {},
}));

describe('inlineDisposition', () => {
  it('uses the name as-is when it is plain ASCII', () => {
    expect(inlineDisposition('invoice.pdf')).toBe(
      `inline; filename="invoice.pdf"; filename*=UTF-8''invoice.pdf`,
    );
  });

  it('replaces non-ASCII characters in the fallback and percent-encodes the real name', () => {
    expect(inlineDisposition('חשבון ספק.pdf')).toBe(
      `inline; filename="_____ ___.pdf"; filename*=UTF-8''` +
        encodeURIComponent('חשבון ספק.pdf'),
    );
  });

  it('never lets a quote break the quoted-string and encodes the RFC 5987 specials', () => {
    expect(inlineDisposition(`it's "a" (1).pdf`)).toBe(
      `inline; filename="it's _a_ (1).pdf"; filename*=UTF-8''it%27s%20%22a%22%20%281%29.pdf`,
    );
  });

  it('falls back to "file" when nothing printable is left', () => {
    expect(inlineDisposition('מסמך')).toBe(
      `inline; filename="____"; filename*=UTF-8''` + encodeURIComponent('מסמך'),
    );
  });
});
