import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ImportDocumentType } from './enums';
import { IMPORT_DOCUMENT_TYPE_FIELD, IMPORT_FILES_FIELD, ImportFilesApi } from './import-files-api';
import type { UploadedImportFileDto } from './models';

describe('ImportFilesApi', () => {
  let api: ImportFilesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ImportFilesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uploadMultipleImportFiles POSTs documentType plus every file as a "files" multipart part', () => {
    const invoice = new File(['invoice'], 'חשבון ספק.pdf', { type: 'application/pdf' });
    const packing = new File(['packing'], 'packing.xlsx');
    const response: UploadedImportFileDto[] = [
      {
        id: 42,
        documentType: ImportDocumentType.SUPPLIER_INVOICE,
        name: 'חשבון ספק.pdf',
        size: 7,
        mimeType: 'application/pdf',
        relativePath: '1000/חשבון ספק.pdf',
        uploadedAt: '2026-09-22T16:05:18.000Z',
      },
    ];

    let result: UploadedImportFileDto[] | undefined;
    api
      .uploadMultipleImportFiles(1000, ImportDocumentType.SUPPLIER_INVOICE, [invoice, packing])
      .subscribe((r) => (result = r));

    const req = http.expectOne('/api/import-files/1000');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    const body = req.request.body as FormData;
    expect(body.get(IMPORT_DOCUMENT_TYPE_FIELD)).toBe(ImportDocumentType.SUPPLIER_INVOICE);
    const parts = body.getAll(IMPORT_FILES_FIELD) as File[];
    expect(parts.map((f) => f.name)).toEqual(['חשבון ספק.pdf', 'packing.xlsx']);

    req.flush(response);
    expect(result).toEqual(response);
  });
});
