import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ClassificationApproval, ImportDocumentType, TradeAgreement } from './enums';
import type { FilingContext } from './filing-context.model';
import { IMPORT_DOCUMENT_TYPE_FIELD, IMPORT_FILES_FIELD, ImportFilesApi } from './import-files-api';
import type {
  InvoiceLineItemDto,
  LineItemClassificationUpdateDto,
  UploadedImportFileDto,
} from './models';

const ORDER_CONTEXT: FilingContext = { kind: 'order', id: 1000 };
const CCF_CONTEXT: FilingContext = { kind: 'ccf', id: 7 };

const STORED_INVOICE: UploadedImportFileDto = {
  id: 42,
  documentType: ImportDocumentType.SUPPLIER_INVOICE,
  name: 'חשבון ספק.pdf',
  size: 7,
  mimeType: 'application/pdf',
  relativePath: 'order-1000/חשבון ספק.pdf',
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

  it('listImportFiles GETs the files of an order context', () => {
    let result: UploadedImportFileDto[] | undefined;
    api.listImportFiles(ORDER_CONTEXT).subscribe((r) => (result = r));

    const req = http.expectOne('/api/import-files?orderId=1000');
    expect(req.request.method).toBe('GET');

    req.flush([STORED_INVOICE]);
    expect(result).toEqual([STORED_INVOICE]);
  });

  it('listImportFiles GETs the files of a CCF context', () => {
    api.listImportFiles(CCF_CONTEXT).subscribe();
    http.expectOne('/api/import-files?ccfId=7').flush([]);
  });

  it('getImportFileBlob GETs one file as a Blob', () => {
    let result: Blob | undefined;
    api.getImportFileBlob(ORDER_CONTEXT, 42).subscribe((r) => (result = r));

    const req = http.expectOne('/api/import-files/files/42?orderId=1000');
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
      .uploadMultipleImportFiles(ORDER_CONTEXT, ImportDocumentType.SUPPLIER_INVOICE, [
        invoice,
        packing,
      ])
      .subscribe((r) => (result = r));

    const req = http.expectOne('/api/import-files?orderId=1000');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    const body = req.request.body as FormData;
    expect(body.get(IMPORT_DOCUMENT_TYPE_FIELD)).toBe(ImportDocumentType.SUPPLIER_INVOICE);
    const parts = body.getAll(IMPORT_FILES_FIELD) as File[];
    expect(parts.map((f) => f.name)).toEqual(['חשבון ספק.pdf', 'packing.xlsx']);

    req.flush(response);
    expect(result).toEqual(response);
  });

  const LINE_ITEM: InvoiceLineItemDto = {
    fileId: 42,
    lineIndex: 0,
    item: 'Y8022-140BK',
    description: 'Light Fixtures',
    quantity: 15,
    price: 15.32,
    total: 229.8,
    classification: {
      tradeAgreement: null,
      classificationCode: '',
      approvals: [],
      licenses: [],
      countryId: null,
    },
  };

  it('getSupplierInvoiceLineItems GETs the line items of the context', () => {
    const response: InvoiceLineItemDto[] = [LINE_ITEM];

    let result: InvoiceLineItemDto[] | undefined;
    api.getSupplierInvoiceLineItems(ORDER_CONTEXT).subscribe((r) => (result = r));

    const req = http.expectOne('/api/import-files/line-items?orderId=1000');
    expect(req.request.method).toBe('GET');

    req.flush(response);
    expect(result).toEqual(response);
  });

  it('saveLineItemClassifications PUTs the items and returns the refreshed line items', () => {
    const items: LineItemClassificationUpdateDto[] = [
      {
        fileId: 42,
        lineIndex: 0,
        tradeAgreement: TradeAgreement.EU,
        classificationCode: '8539.50.00',
        approvals: [ClassificationApproval.COSMETICS],
        licenses: [],
        countryId: 106,
      },
    ];

    let result: InvoiceLineItemDto[] | undefined;
    api.saveLineItemClassifications(ORDER_CONTEXT, items).subscribe((r) => (result = r));

    const req = http.expectOne('/api/import-files/line-items/classification?orderId=1000');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ items });

    req.flush([LINE_ITEM]);
    expect(result).toEqual([LINE_ITEM]);
  });
});
