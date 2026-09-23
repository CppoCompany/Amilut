import { BadRequestException } from '@nestjs/common';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { ImportFilesService, safeFileName } from './import-files.service';

function fakeFile(
  originalname: string,
  content: string,
  mimetype = 'application/pdf',
) {
  const buffer = Buffer.from(content, 'utf8');
  return { originalname, buffer, size: buffer.length, mimetype };
}

describe('ImportFilesService', () => {
  let storageDir: string;
  let service: ImportFilesService;

  beforeEach(async () => {
    storageDir = await mkdtemp(path.join(tmpdir(), 'amilut-storage-'));
    service = new ImportFilesService(storageDir);
  });

  afterEach(() => rm(storageDir, { recursive: true, force: true }));

  it('writes every file under <storage>/<accountNumber>/ keeping the original names', async () => {
    const result = await service.uploadMultipleImportFiles(1000, [
      fakeFile('חשבון ספק.pdf', 'invoice'),
      fakeFile('packing list.xlsx', 'packing', 'application/vnd.ms-excel'),
    ]);

    const accountDir = path.join(storageDir, '1000');
    expect((await readdir(accountDir)).sort()).toEqual([
      'packing list.xlsx',
      'חשבון ספק.pdf',
    ]);
    expect(await readFile(path.join(accountDir, 'חשבון ספק.pdf'), 'utf8')).toBe(
      'invoice',
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'חשבון ספק.pdf',
      size: Buffer.byteLength('invoice'),
      mimeType: 'application/pdf',
      relativePath: '1000/חשבון ספק.pdf',
    });
    expect(new Date(result[0].uploadedAt).toISOString()).toBe(
      result[0].uploadedAt,
    );
  });

  it('overwrites a file that already exists with the same name', async () => {
    await service.uploadMultipleImportFiles(7, [fakeFile('a.pdf', 'old')]);
    await service.uploadMultipleImportFiles(7, [fakeFile('a.pdf', 'new')]);

    expect(await readFile(path.join(storageDir, '7', 'a.pdf'), 'utf8')).toBe(
      'new',
    );
  });

  it('rejects an empty upload', async () => {
    await expect(
      service.uploadMultipleImportFiles(1000, []),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-positive account number', async () => {
    await expect(
      service.uploadMultipleImportFiles(0, [fakeFile('a.pdf', 'x')]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes nothing when one of the names is unsafe', async () => {
    await expect(
      service.uploadMultipleImportFiles(9, [
        fakeFile('ok.pdf', 'x'),
        fakeFile('../evil.pdf', 'y'),
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(readdir(path.join(storageDir, '9'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects file names that could escape the account folder', () => {
    for (const bad of [
      '',
      ' ',
      '..',
      '../x.pdf',
      'a/b.pdf',
      'a\\b.pdf',
      'a\0.pdf',
    ]) {
      expect(() => safeFileName(bad)).toThrow(BadRequestException);
    }
    expect(safeFileName(' תעודת מקור.pdf ')).toBe('תעודת מקור.pdf');
  });
});
