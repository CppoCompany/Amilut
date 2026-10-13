import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ImportDocumentType } from '../../../api/enums';
import type { FilingContext } from '../../../api/filing-context.model';
import { IMPORT_DOCUMENT_TYPE_FIELD, IMPORT_FILES_FIELD } from '../../../api/import-files-api';
import type { UploadedImportFileDto } from '../../../api/models';
import { ImportFilesPanel } from './import-files-panel';

type PanelInternals = {
  documentType: WritableSignal<ImportDocumentType | null>;
  successMessage: () => string | null;
  errorMessage: () => string | null;
  openFilePicker: () => void;
  uploadMultipleImportFiles: (files: File[]) => void;
};

const ORDER_CONTEXT: FilingContext = { kind: 'order', id: 1000 };
const OTHER_ORDER_CONTEXT: FilingContext = { kind: 'order', id: 1001 };
const LIST_URL = '/api/import-files?orderId=1000';
const OTHER_LIST_URL = '/api/import-files?orderId=1001';

const INVOICE: UploadedImportFileDto = {
  id: 42,
  documentType: ImportDocumentType.SUPPLIER_INVOICE,
  name: 'invoice.pdf',
  size: 870400,
  mimeType: 'application/pdf',
  relativePath: 'order-1000/invoice.pdf',
  uploadedAt: '2026-09-22T10:00:00.000Z',
};

const PACKING_LIST: UploadedImportFileDto = {
  id: 17,
  documentType: ImportDocumentType.PACKING_LIST,
  name: 'מפרט אריזות.pdf',
  size: 1258291,
  mimeType: 'application/pdf',
  relativePath: 'order-1000/מפרט אריזות.pdf',
  uploadedAt: '2026-09-21T10:00:00.000Z',
};

let fixture: ComponentFixture<ImportFilesPanel>;
let internals: PanelInternals;
let httpMock: HttpTestingController;

/** Creates the panel with `context` already set as an input. */
async function setup(context: FilingContext | null): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [ImportFilesPanel],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();

  httpMock = TestBed.inject(HttpTestingController);
  fixture = TestBed.createComponent(ImportFilesPanel);
  internals = fixture.componentInstance as unknown as PanelInternals;
  fixture.componentRef.setInput('context', context);
  fixture.detectChanges();
}

/** Answers the list request the panel fires once a context is set. */
function flushList(files: UploadedImportFileDto[]): void {
  const req = httpMock.expectOne(LIST_URL);
  expect(req.request.method).toBe('GET');
  req.flush(files);
  fixture.detectChanges();
}

function uploadButton(): HTMLButtonElement {
  return fixture.nativeElement.querySelector('.upload-area .upload-btn');
}

function select(): HTMLSelectElement {
  return fixture.nativeElement.querySelector('select#documentType');
}

/** The `.document-category` section whose title contains `label` (a document-type Hebrew label). */
function categorySection(label: string): HTMLElement | undefined {
  return Array.from(fixture.nativeElement.querySelectorAll('.document-category')).find((el) =>
    (el as HTMLElement).querySelector('.document-category__title')?.textContent?.includes(label),
  ) as HTMLElement | undefined;
}

function categoryCount(label: string): string | null {
  return categorySection(label)?.querySelector('.document-category__count')?.textContent?.trim() ?? null;
}

/** Rows (name, date, size) within one category's table — no document-type
 *  column, since the category heading already says it; the trailing actions
 *  cell (the "פתח" button) is also dropped. */
function categoryRows(label: string): string[][] {
  const section = categorySection(label);
  if (!section) return [];
  return Array.from(section.querySelectorAll('tbody tr')).map((tr) =>
    Array.from((tr as HTMLElement).querySelectorAll('td'))
      .slice(0, 3)
      .map((td) => td.textContent?.trim() ?? ''),
  );
}

function categoryEmptyText(label: string): string | null {
  return categorySection(label)?.querySelector('.document-category__empty')?.textContent?.trim() ?? null;
}

function documentsHint(): string | null {
  return fixture.nativeElement.querySelector('.documents-hint')?.textContent?.trim() ?? null;
}

describe('ImportFilesPanel before a context is set', () => {
  beforeEach(() => setup(null));

  afterEach(() => httpMock.verify());

  it('requests nothing, shows a hint — not an error — and renders no categories', () => {
    httpMock.expectNone(LIST_URL);
    expect(fixture.nativeElement.querySelector('.form-message--error')).toBeNull();
    expect(internals.errorMessage()).toBeNull();
    expect(fixture.nativeElement.querySelector('.document-categories')).toBeNull();
    expect(documentsHint()).toBe('בחר הזמנה או תיק עמילות כדי להציג את הקבצים שלו');
    expect(uploadButton().disabled).toBe(true);

    // Even with a document type chosen, there is no context to upload to.
    internals.documentType.set(ImportDocumentType.PACKING_LIST);
    fixture.detectChanges();
    expect(uploadButton().disabled).toBe(true);
    internals.uploadMultipleImportFiles([new File(['x'], 'a.pdf')]);
    httpMock.expectNone(() => true);
  });
});

describe('ImportFilesPanel', () => {
  beforeEach(() => setup(ORDER_CONTEXT));

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('no longer shows the old Case/Internal ID/Supplier/Document Number cards', () => {
    flushList([]);

    expect(fixture.nativeElement.querySelector('.details-grid')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('מספר זיהוי פנימי');
    expect(fixture.nativeElement.textContent).not.toContain('Shanghai Tech Components');
    expect(fixture.nativeElement.textContent).not.toContain('NEXF123456789');
  });

  it('renders the document-type picker above the upload area with a placeholder selected, offering every type including "מסמכים נוספים"', () => {
    flushList([]);
    const picker = select();
    expect(picker).toBeTruthy();
    expect(picker.value).toBe('');
    expect(picker.options.length).toBe(7); // placeholder + 6 ImportDocumentType members
    expect(picker.options[1].textContent?.trim()).toBe('חשבון ספק');
    expect(picker.options[6].textContent?.trim()).toBe('מסמכים נוספים');
    // The picker's group precedes the drop zone in document order.
    const area = fixture.nativeElement.querySelector('.upload-area') as HTMLElement;
    expect(picker.compareDocumentPosition(area) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers only the restricted 4-type subset when documentTypes is overridden (CCF screen usage), and groups the list into those 4 categories', () => {
    fixture.componentRef.setInput('documentTypes', [
      ImportDocumentType.BILL_OF_LADING,
      ImportDocumentType.SUPPLIER_INVOICE,
      ImportDocumentType.PACKING_LIST,
      ImportDocumentType.OTHER,
    ]);
    flushList([]);

    expect(select().options.length).toBe(5); // placeholder + 4
    const categoryLabels = Array.from(
      fixture.nativeElement.querySelectorAll('.document-category__title') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent?.replace(/\(\d+\)/, '').trim());
    expect(categoryLabels).toEqual(['שטר מטען', 'חשבון ספק', 'מפרט אריזות', 'מסמכים נוספים']);
  });

  it('disables uploading until a document type is chosen', () => {
    flushList([]);
    expect(uploadButton().disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.hint-text:not(.documents-hint)')?.textContent?.trim()).toBe(
      'יש לבחור סוג מסמך לפני העלאת קבצים',
    );

    internals.uploadMultipleImportFiles([new File(['x'], 'a.pdf')]);
    httpMock.expectNone(LIST_URL);

    select().value = ImportDocumentType.PACKING_LIST;
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(internals.documentType()).toBe(ImportDocumentType.PACKING_LIST);
    expect(uploadButton().disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.hint-text:not(.documents-hint)')).toBeNull();
  });

  it('swaps the categorized list and clears the messages when another context is set', () => {
    httpMock
      .expectOne(LIST_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(internals.errorMessage()).toBe('טעינת רשימת הקבצים נכשלה');

    fixture.componentRef.setInput('context', OTHER_ORDER_CONTEXT);
    fixture.detectChanges();

    expect(internals.errorMessage()).toBeNull();
    httpMock.expectOne(OTHER_LIST_URL).flush([PACKING_LIST]);
    fixture.detectChanges();
    expect(categoryRows('מפרט אריזות')).toEqual([['מפרט אריזות.pdf', '21/09/2026', '1.2 MB']]);
  });

  it('shows the loading hint (no categories yet) then per-category empty states when the context has no files', () => {
    expect(fixture.nativeElement.querySelector('.document-categories')).toBeNull();
    expect(documentsHint()).toBe('טוען קבצים…');

    flushList([]);

    expect(documentsHint()).toBeNull();
    expect(categoryEmptyText('חשבון ספק')).toBe('לא הועלו מסמכים מסוג זה');
    expect(categoryCount('חשבון ספק')).toBe('(0)');
    expect(fixture.nativeElement.querySelector('.form-message--error')).toBeNull();
  });

  it('lists the stored files under their own category, each with dd/MM/yyyy date and human size, no type column', () => {
    flushList([INVOICE, PACKING_LIST]);

    expect(categoryCount('חשבון ספק')).toBe('(1)');
    expect(categoryRows('חשבון ספק')).toEqual([['invoice.pdf', '22/09/2026', '850 KB']]);
    expect(categoryCount('מפרט אריזות')).toBe('(1)');
    expect(categoryRows('מפרט אריזות')).toEqual([['מפרט אריזות.pdf', '21/09/2026', '1.2 MB']]);
    // A type with nothing filed under it still gets its own (empty) section.
    expect(categoryCount('שטר מטען')).toBe('(0)');
  });

  it('shows an error and empty categories when the list cannot be loaded', () => {
    httpMock
      .expectOne(LIST_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(categoryRows('חשבון ספק')).toEqual([]);
    expect(internals.errorMessage()).toBe('טעינת רשימת הקבצים נכשלה');
    expect(fixture.nativeElement.querySelector('.form-message--error')?.textContent?.trim()).toBe(
      'טעינת רשימת הקבצים נכשלה',
    );
  });

  it('sends documentType with the files and moves the new row into its category, replacing a same-name file', () => {
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
    expect(categoryRows('חשבון ספק')).toEqual([['invoice.pdf', '26/09/2026', '3 B']]);
    expect(categoryRows('מפרט אריזות')).toEqual([['מפרט אריזות.pdf', '21/09/2026', '1.2 MB']]);
  });

  describe('opening a file', () => {
    const FILE_URL = `/api/import-files/files/${INVOICE.id}?orderId=1000`;
    let viewer: { closed: boolean; location: { href: string }; close: ReturnType<typeof vi.fn> };
    let createObjectURL: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      viewer = { closed: false, location: { href: 'about:blank' }, close: vi.fn() };
      vi.spyOn(window, 'open').mockReturnValue(viewer as unknown as Window);
      // jsdom has no blob URLs; stub the pair the panel uses.
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
