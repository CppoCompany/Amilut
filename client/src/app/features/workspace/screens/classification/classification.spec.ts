import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { InvoiceLineItemDto } from '../../../../api/models';
import { CURRENT_CASE_NUMBER } from '../../current-case';
import { ClassificationScreen } from './classification';

const LINE_ITEMS_URL = `/api/import-files/${CURRENT_CASE_NUMBER}/line-items`;

describe('ClassificationScreen', () => {
  let fixture: ComponentFixture<ClassificationScreen>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClassificationScreen],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ClassificationScreen);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function rows(): string[][] {
    const trs = Array.from(
      fixture.nativeElement.querySelectorAll('.documents-table tbody tr') as NodeListOf<HTMLElement>,
    );
    return trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''));
  }

  it('shows the loading line while the line items are being fetched', () => {
    expect(fixture.nativeElement.querySelector('.products-loading')?.textContent?.trim()).toBe(
      'טוען פריטים…',
    );
    expect(fixture.nativeElement.querySelector('.products-empty')).toBeNull();

    httpMock.expectOne(LINE_ITEMS_URL).flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.products-loading')).toBeNull();
  });

  it('renders the extracted line items as product rows, leaving unmapped columns blank', () => {
    const items: InvoiceLineItemDto[] = [
      { item: 'Y8022-140BK', description: 'Light Fixtures', quantity: 15, price: 15.32, total: 229.8 },
      // Cast: the extractor may leave numbers unknown; the screen must render blanks for them.
      { item: 'ABC-1', description: 'Cable', quantity: null, price: null, total: null } as unknown as InvoiceLineItemDto,
    ];

    const req = httpMock.expectOne(LINE_ITEMS_URL);
    expect(req.request.method).toBe('GET');
    req.flush(items);
    fixture.detectChanges();

    expect(rows()).toEqual([
      ['Y8022-140BK', 'Light Fixtures', '15', '15.32', '229.80', '', '', ''],
      ['ABC-1', 'Cable', '', '', '', '', '', ''],
    ]);
    expect(fixture.nativeElement.querySelector('.products-empty')).toBeNull();
    expect(fixture.nativeElement.querySelector('.form-message--error')).toBeNull();
  });

  it('shows the empty-state row when the case has no line items', () => {
    httpMock.expectOne(LINE_ITEMS_URL).flush([]);
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('.products-empty td') as HTMLTableCellElement;
    expect(empty).toBeTruthy();
    expect(empty.colSpan).toBe(8);
    expect(empty.textContent?.trim()).toBe(
      'לא נמצאו פריטים מחשבון ספק — העלה חשבון ספק במסך תיוק ניירת יבוא',
    );
  });

  it('shows the error line when loading fails', () => {
    httpMock
      .expectOne(LINE_ITEMS_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.form-message--error')?.textContent?.trim()).toBe(
      'טעינת פריטי חשבון הספק נכשלה',
    );
    expect(fixture.nativeElement.querySelector('.products-loading')).toBeNull();
    expect(fixture.nativeElement.querySelector('.products-empty')).toBeTruthy();
  });

  it('addRow appends an empty row that renders blank cells', () => {
    httpMock.expectOne(LINE_ITEMS_URL).flush([]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.btn-secondary') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(rows()).toEqual([['', '', '', '', '', '', '', '']]);
  });
});
