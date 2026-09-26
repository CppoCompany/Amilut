import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ImportDocumentType } from './enums';
import { IMPORT_DOCUMENT_TYPE_FIELD, IMPORT_FILES_FIELD, ImportFilesApi } from './import-files-api';
import type { InvoiceLineItemDto, UploadedImportFileDto } from './models';

const STORED_INVOICE: UploadedImportFileDto = {
  id: 42,
  documentType: ImportDocumentType.SUPPLIER_INVOICE,
  name: 'חשבון ספק.pdf',
  size: 7,
  mimeType: 'application/pdf',
  relativePath: '1000/חשבון ספק.pdf',
  uploadedAt: '2026-09-22T16:05:18.000Z',
};

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

  it('listImportFiles GETs the files of the case', () => {
    let result: UploadedImportFileDto[] | undefined;
    api.listImportFiles(1000).subscribe((r) => (result = r));

    const req = http.expectOne('/api/import-files/1000');
    expect(req.request.method).toBe('GET');

    req.flush([STORED_INVOICE]);
    expect(result).toEqual([STORED_INVOICE]);
  });

  it('getImportFileBlob GETs one file as a Blob', () => {
    let result: Blob | undefined;
    api.getImportFileBlob(1000, 42).subscribe((r) => (result = r));

    const req = http.expectOne('/api/import-files/1000/files/42');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');

    req.flush(new Blob(['%PDF-1.7'], { type: 'application/pdf' }));
    expect(result).toBeInstanceOf(Blob);
    expect(result?.type).toBe('application/pdf');
  });

  it('uploadMultipleImportFiles POSTs documentType plus every file as a "files" multipart part', () => {
    const invoice = new File(['invoice'], 'חשבון ספק.pdf', { type: 'application/pdf' });
    const packing = new File(['packing'], 'packing.xlsx');
    const response: UploadedImportFileDto[] = [STORED_INVOICE];

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

  it('getSupplierInvoiceLineItems GETs the line items of the case', () => {
    const response: InvoiceLineItemDto[] = [
      { item: 'Y8022-140BK', description: 'Light Fixtures', quantity: 15, price: 15.32, total: 229.8 },
    ];

    let result: InvoiceLineItemDto[] | undefined;
    api.getSupplierInvoiceLineItems(1000).subscribe((r) => (result = r));

    const req = http.expectOne('/api/import-files/1000/line-items');
    expect(req.request.method).toBe('GET');

    req.flush(response);
    expect(result).toEqual(response);
  });
});
