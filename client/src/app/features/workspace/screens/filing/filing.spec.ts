import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImportDocumentType } from '../../../../api/enums';
import { IMPORT_DOCUMENT_TYPE_FIELD, IMPORT_FILES_FIELD } from '../../../../api/import-files-api';
import type { UploadedImportFileDto } from '../../../../api/models';
import { FilingScreen } from './filing';

type FilingInternals = {
  documentType: WritableSignal<ImportDocumentType | null>;
  successMessage: () => string | null;
  openFilePicker: () => void;
  uploadMultipleImportFiles: (files: File[]) => void;
};

describe('FilingScreen', () => {
  let fixture: ComponentFixture<FilingScreen>;
  let internals: FilingInternals;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilingScreen],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FilingScreen);
    internals = fixture.componentInstance as unknown as FilingInternals;
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function select(): HTMLSelectElement {
    return fixture.nativeElement.querySelector('select#documentType');
  }

  function uploadButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.upload-area .upload-btn');
  }

  it('renders the document-type picker above the upload area with a placeholder selected', () => {
    const picker = select();
    expect(picker).toBeTruthy();
    expect(picker.value).toBe('');
    expect(picker.options.length).toBe(6);
    expect(picker.options[1].textContent?.trim()).toBe('חשבון ספק');
    // The picker's group precedes the drop zone in document order.
    const area = fixture.nativeElement.querySelector('.upload-area') as HTMLElement;
    expect(picker.compareDocumentPosition(area) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('disables uploading until a document type is chosen', () => {
    expect(uploadButton().disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.hint-text')?.textContent?.trim()).toBe(
      'יש לבחור סוג מסמך לפני העלאת קבצים',
    );

    internals.uploadMultipleImportFiles([new File(['x'], 'a.pdf')]);
    httpMock.expectNone('/api/import-files/1000');

    select().value = ImportDocumentType.PACKING_LIST;
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(internals.documentType()).toBe(ImportDocumentType.PACKING_LIST);
    expect(uploadButton().disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.hint-text')).toBeNull();
  });

  it('sends documentType with the files and shows the label in the table', () => {
    internals.documentType.set(ImportDocumentType.SUPPLIER_INVOICE);
    fixture.detectChanges();
    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });

    internals.uploadMultipleImportFiles([file]);

    const req = httpMock.expectOne('/api/import-files/1000');
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body.get(IMPORT_DOCUMENT_TYPE_FIELD)).toBe(ImportDocumentType.SUPPLIER_INVOICE);
    expect(body.getAll(IMPORT_FILES_FIELD).length).toBe(1);

    const uploaded: UploadedImportFileDto = {
      id: 42,
      documentType: ImportDocumentType.SUPPLIER_INVOICE,
      name: 'invoice.pdf',
      size: 3,
      mimeType: 'application/pdf',
      relativePath: '1000/invoice.pdf',
      uploadedAt: '2026-09-26T08:00:00.000Z',
    };
    req.flush([uploaded]);
    fixture.detectChanges();

    expect(internals.successMessage()).toBe('קובץ אחד הועלה בהצלחה');
    const firstRow = fixture.nativeElement.querySelector('.documents-table tbody tr') as HTMLElement;
    const cells = Array.from(firstRow.querySelectorAll('td')).map((td) => td.textContent?.trim());
    expect(cells[0]).toBe('invoice.pdf');
    expect(cells[1]).toBe('חשבון ספק');
  });
});
