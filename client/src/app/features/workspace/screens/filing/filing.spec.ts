import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ImportDocumentType, MblShippingType, SeaMethod } from '../../../../api/enums';
import { IMPORT_DOCUMENT_TYPE_FIELD, IMPORT_FILES_FIELD } from '../../../../api/import-files-api';
import type { MblSummaryDto, UploadedImportFileDto } from '../../../../api/models';
import { CurrentCaseService } from '../../current-case.service';
import { FilingScreen } from './filing';

type FilingInternals = {
  documentType: WritableSignal<ImportDocumentType | null>;
  successMessage: () => string | null;
  errorMessage: () => string | null;
  openFilePicker: () => void;
  uploadMultipleImportFiles: (files: File[]) => void;
};

const CASE_ID = 1000;
const OTHER_CASE_ID = 1001;
const LIST_URL = `/api/import-files/${CASE_ID}`;
const CASES_URL = '/api/mbl';

function mblCase(id: number): MblSummaryDto {
  return {
    id,
    shippingType: MblShippingType.SEA,
    seaMethod: SeaMethod.FCL_FCL,
    mblNumber: `MBL-${id}`,
    carrierName: null,
    hblCount: 1,
    orderIds: [],
    customerNames: ['ACME Ltd.'],
    createdAt: '2026-09-01T08:30:00.000Z',
  };
}

const INVOICE: UploadedImportFileDto = {
  id: 42,
  documentType: ImportDocumentType.SUPPLIER_INVOICE,
  name: 'invoice.pdf',
  size: 870400,
  mimeType: 'application/pdf',
  relativePath: '1000/invoice.pdf',
  uploadedAt: '2026-09-22T10:00:00.000Z',
};

const PACKING_LIST: UploadedImportFileDto = {
  id: 17,
  documentType: ImportDocumentType.PACKING_LIST,
  name: 'מפרט אריזות.pdf',
  size: 1258291,
  mimeType: 'application/pdf',
  relativePath: '1000/מפרט אריזות.pdf',
  uploadedAt: '2026-09-21T10:00:00.000Z',
};

let fixture: ComponentFixture<FilingScreen>;
let internals: FilingInternals;
let httpMock: HttpTestingController;
let currentCase: CurrentCaseService;

/** Creates the screen with `caseId` already picked (or none) and answers the case picker's lookup. */
async function setup(caseId: number | null): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [FilingScreen],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();

  httpMock = TestBed.inject(HttpTestingController);
  currentCase = TestBed.inject(CurrentCaseService);
  currentCase.caseId.set(caseId);
  fixture = TestBed.createComponent(FilingScreen);
  internals = fixture.componentInstance as unknown as FilingInternals;
  fixture.detectChanges();
  httpMock
    .expectOne((req) => req.url === CASES_URL)
    .flush([mblCase(CASE_ID), mblCase(OTHER_CASE_ID)]);
  fixture.detectChanges();
}

/** Answers the list request the screen fires once a case is picked. */
function flushList(files: UploadedImportFileDto[]): void {
  const req = httpMock.expectOne(LIST_URL);
  expect(req.request.method).toBe('GET');
  req.flush(files);
  fixture.detectChanges();
}

function uploadButton(): HTMLButtonElement {
  return fixture.nativeElement.querySelector('.upload-area .upload-btn');
}

function rows(): string[][] {
  const trs = Array.from(
    fixture.nativeElement.querySelectorAll(
      '.documents-table tbody tr:not(.documents-empty)',
    ) as NodeListOf<HTMLElement>,
  );
  return trs.map((tr) =>
    Array.from(tr.querySelectorAll('td'))
      .slice(0, 4)
      .map((td) => td.textContent?.trim() ?? ''),
  );
}

function emptyRow(): HTMLElement | null {
  return fixture.nativeElement.querySelector('.documents-table tbody tr.documents-empty');
}

describe('FilingScreen before a case is picked', () => {
  beforeEach(() => setup(null));

  afterEach(() => httpMock.verify());

  it('requests nothing and shows a hint — not an error — on entry', () => {
    httpMock.expectNone(LIST_URL);
    expect(fixture.nativeElement.querySelector('.form-message--error')).toBeNull();
    expect(internals.errorMessage()).toBeNull();
    expect(rows()).toEqual([]);
    expect(emptyRow()?.textContent?.trim()).toBe('בחר תיק כדי להציג את הקבצים שלו');
    expect(uploadButton().disabled).toBe(true);

    // Even with a document type chosen, there is no case to upload to.
    internals.documentType.set(ImportDocumentType.PACKING_LIST);
    fixture.detectChanges();
    expect(uploadButton().disabled).toBe(true);
    internals.uploadMultipleImportFiles([new File(['x'], 'a.pdf')]);
    httpMock.expectNone(() => true);
  });

  it('loads the files of the case picked in the case picker', () => {
    const picker = fixture.nativeElement.querySelector('select#casePicker') as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.textContent?.trim())).toEqual([
      'בחר תיק',
      'תיק 1000 · MBL-1000 · ACME Ltd.',
      'תיק 1001 · MBL-1001 · ACME Ltd.',
    ]);

    picker.value = String(CASE_ID);
    picker.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(currentCase.caseId()).toBe(CASE_ID);
    flushList([INVOICE]);
    expect(rows()).toEqual([['invoice.pdf', 'חשבון ספק', '22/09/2026', '850 KB']]);
  });
});

describe('FilingScreen', () => {
  beforeEach(() => setup(CASE_ID));

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  function select(): HTMLSelectElement {
    return fixture.nativeElement.querySelector('select#documentType');
  }

  it('no longer shows the old Case/Internal ID/Supplier/Document Number cards', () => {
    flushList([]);

    expect(fixture.nativeElement.querySelector('.details-grid')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('מספר זיהוי פנימי');
    expect(fixture.nativeElement.textContent).not.toContain('Shanghai Tech Components');
    expect(fixture.nativeElement.textContent).not.toContain('NEXF123456789');
  });

  it('renders the document-type picker above the upload area with a placeholder selected', () => {
    flushList([]);
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
    flushList([]);
    expect(uploadButton().disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.hint-text')?.textContent?.trim()).toBe(
      'יש לבחור סוג מסמך לפני העלאת קבצים',
    );

    internals.uploadMultipleImportFiles([new File(['x'], 'a.pdf')]);
    httpMock.expectNone(LIST_URL);

    select().value = ImportDocumentType.PACKING_LIST;
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(internals.documentType()).toBe(ImportDocumentType.PACKING_LIST);
    expect(uploadButton().disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.hint-text')).toBeNull();
  });

  it('swaps the table and clears the messages when another case is picked', () => {
    httpMock
      .expectOne(LIST_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(internals.errorMessage()).toBe('טעינת רשימת הקבצים נכשלה');

    currentCase.caseId.set(OTHER_CASE_ID);
    fixture.detectChanges();

    expect(internals.errorMessage()).toBeNull();
    httpMock.expectOne(`/api/import-files/${OTHER_CASE_ID}`).flush([PACKING_LIST]);
    fixture.detectChanges();
    expect(rows()).toEqual([['מפרט אריזות.pdf', 'מפרט אריזות', '21/09/2026', '1.2 MB']]);
  });

  it('starts with a loading row and shows the empty state when the case has no files', () => {
    expect(rows()).toEqual([]);
    expect(emptyRow()?.textContent?.trim()).toBe('טוען קבצים…');

    flushList([]);

    expect(rows()).toEqual([]);
    expect(emptyRow()?.textContent?.trim()).toBe('לא הועלו קבצים לתיק זה עדיין');
    expect(fixture.nativeElement.querySelector('.form-message--error')).toBeNull();
  });

  it('lists the stored files of the case with type label, dd/MM/yyyy date and human size', () => {
    flushList([INVOICE, PACKING_LIST]);

    expect(emptyRow()).toBeNull();
    expect(rows()).toEqual([
      ['invoice.pdf', 'חשבון ספק', '22/09/2026', '850 KB'],
      ['מפרט אריזות.pdf', 'מפרט אריזות', '21/09/2026', '1.2 MB'],
    ]);
  });

  it('shows an error and an empty table when the list cannot be loaded', () => {
    httpMock
      .expectOne(LIST_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(rows()).toEqual([]);
    expect(internals.errorMessage()).toBe('טעינת רשימת הקבצים נכשלה');
    expect(fixture.nativeElement.querySelector('.form-message--error')?.textContent?.trim()).toBe(
      'טעינת רשימת הקבצים נכשלה',
    );
  });

  it('sends documentType with the files and prepends the stored rows, replacing same-name files', () => {
    flushList([PACKING_LIST, { ...INVOICE, id: 40, uploadedAt: '2026-09-20T10:00:00.000Z' }]);
    internals.documentType.set(ImportDocumentType.SUPPLIER_INVOICE);
    fixture.detectChanges();
    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });

    internals.uploadMultipleImportFiles([file]);

    const req = httpMock.expectOne(LIST_URL);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body.get(IMPORT_DOCUMENT_TYPE_FIELD)).toBe(ImportDocumentType.SUPPLIER_INVOICE);
    expect(body.getAll(IMPORT_FILES_FIELD).length).toBe(1);

    req.flush([{ ...INVOICE, size: 3, uploadedAt: '2026-09-26T08:00:00.000Z' }]);
    fixture.detectChanges();

    expect(internals.successMessage()).toBe('קובץ אחד הועלה בהצלחה');
    expect(rows()).toEqual([
      ['invoice.pdf', 'חשבון ספק', '26/09/2026', '3 B'],
      ['מפרט אריזות.pdf', 'מפרט אריזות', '21/09/2026', '1.2 MB'],
    ]);
  });

  describe('opening a file', () => {
    const FILE_URL = `/api/import-files/${CASE_ID}/files/${INVOICE.id}`;
    let viewer: { closed: boolean; location: { href: string }; close: ReturnType<typeof vi.fn> };
    let createObjectURL: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      viewer = { closed: false, location: { href: 'about:blank' }, close: vi.fn() };
      vi.spyOn(window, 'open').mockReturnValue(viewer as unknown as Window);
      // jsdom has no blob URLs; stub the pair the screen uses.
      createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
      Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
      flushList([INVOICE]);
    });

    function openButton(): HTMLButtonElement {
      return fixture.nativeElement.querySelector('.documents-table tbody .open-btn');
    }

    it('opens a tab on click and points it at the fetched file', () => {
      expect(openButton().textContent?.trim()).toBe('פתח');
      openButton().click();
      fixture.detectChanges();

      // The tab is opened synchronously in the click, before the bytes arrive.
      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(openButton().disabled).toBe(true);
      expect(openButton().textContent?.trim()).toBe('פותח…');

      const req = httpMock.expectOne(FILE_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
      req.flush(blob);
      fixture.detectChanges();

      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(viewer.location.href).toBe('blob:mock-url');
      expect(viewer.close).not.toHaveBeenCalled();
      expect(openButton().disabled).toBe(false);
      expect(openButton().textContent?.trim()).toBe('פתח');
    });

    it('closes the tab and reports an error when the file cannot be fetched', () => {
      openButton().click();
      fixture.detectChanges();

      httpMock.expectOne(FILE_URL).flush(null, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(viewer.close).toHaveBeenCalled();
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(internals.errorMessage()).toBe('פתיחת הקובץ "invoice.pdf" נכשלה');
      expect(openButton().disabled).toBe(false);
    });
  });
});
