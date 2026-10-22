import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Select } from 'primeng/select';

import {
  CcfStatus,
  ClassificationApproval,
  ClassificationLicense,
  TradeAgreement,
} from '../../../../api/enums';
import type {
  CountryDto,
  DashboardCcfRowDto,
  InvoiceLineItemDto,
  LineItemNoteDto,
} from '../../../../api/models';
import { MultiSelect } from '../../../../shared/multi-select/multi-select';
import { FilingContextService } from '../../filing-context.service';
import { ClassificationScreen, goodsDescriptionOf, groupNotesByLine } from './classification';
import { LineItemNotesDialog } from './line-item-notes-dialog/line-item-notes-dialog';

const ORDER_ID = 1000;
const LINE_ITEMS_URL = `/api/import-files/line-items?orderId=${ORDER_ID}`;
const SAVE_URL = `/api/import-files/line-items/classification?orderId=${ORDER_ID}`;
const COUNTRIES_URL = '/api/countries';
const PENDING_CCFS_URL = '/api/dashboard/ccfs-pending-classification';

function pendingCcf(overrides: Partial<DashboardCcfRowDto> = {}): DashboardCcfRowDto {
  return {
    id: 7,
    fileNumber: 'CCF1007',
    shipmentFileId: 3,
    shipmentFileMblNumber: 'MBL-1',
    customerNames: ['ACME Ltd.'],
    status: CcfStatus.OPEN,
    lineCount: 4,
    classifiedLineCount: 1,
    createdAt: '2026-09-01T08:30:00.000Z',
    ...overrides,
  };
}

const COUNTRIES: CountryDto[] = [
  { id: 106, name: 'ישראל', key: 'IL' },
  { id: 162, name: 'נורווגיה', key: 'NO' },
];

const EMPTY_CLASSIFICATION = {
  tradeAgreement: null,
  classificationCode: '',
  approvals: [],
  licenses: [],
  countryId: null,
};

function lineItem(overrides: Partial<InvoiceLineItemDto> = {}): InvoiceLineItemDto {
  return {
    fileId: 42,
    lineIndex: 0,
    item: 'Y8022-140BK',
    description: 'Light Fixtures',
    quantity: 15,
    price: 15.32,
    total: 229.8,
    classification: EMPTY_CLASSIFICATION,
    ...overrides,
  };
}

describe('goodsDescriptionOf', () => {
  it('joins the distinct, non-empty product names in order', () => {
    expect(
      goodsDescriptionOf([
        { name: 'Light Fixtures' },
        { name: ' Cable ' },
        { name: '' },
        { name: 'Light Fixtures' },
      ]),
    ).toBe('Light Fixtures, Cable');
    expect(goodsDescriptionOf([])).toBe('');
  });
});

const NOTES_PATH = '/api/import-files/line-items/notes';

let fixture: ComponentFixture<ClassificationScreen>;
let httpMock: HttpTestingController;
let filingContext: FilingContextService;

/**
 * Creates the screen with an order context already picked (or none) and
 * answers the pending-CCF list with `pending` (`'error'` fails it).
 */
async function setup(
  orderId: number | null,
  pending: DashboardCcfRowDto[] | 'error' = [],
): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [ClassificationScreen],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();

  httpMock = TestBed.inject(HttpTestingController);
  filingContext = TestBed.inject(FilingContextService);
  fixture = TestBed.createComponent(ClassificationScreen);
  fixture.detectChanges();
  const pendingReq = httpMock.expectOne(PENDING_CCFS_URL);
  if (pending === 'error') {
    pendingReq.flush({ message: 'boom' }, { status: 500, statusText: 'Internal Server Error' });
  } else {
    pendingReq.flush(pending);
  }
  filingContext.context.set(orderId !== null ? { kind: 'order', id: orderId } : null);
  fixture.detectChanges();
}

/** The row-notes load runs beside every line-item load; tests that don't care about notes leave it pending. */
function verifyHttp(): void {
  httpMock.match((req) => req.url === NOTES_PATH && req.method === 'GET');
  httpMock.verify();
}

function note(overrides: Partial<LineItemNoteDto> = {}): LineItemNoteDto {
  return {
    id: 1,
    fileId: 42,
    lineIndex: 0,
    body: 'לבדוק מול הספק',
    createdByName: 'Dana Levi',
    createdAt: '2026-09-20T08:30:00.000Z',
    ...overrides,
  };
}

describe('groupNotesByLine', () => {
  it('groups notes per file line, keeping their order', () => {
    const a = note({ id: 1 });
    const b = note({ id: 2, lineIndex: 1 });
    const c = note({ id: 3 });
    const grouped = groupNotesByLine([a, b, c]);
    expect(grouped.get('42:0')).toEqual([a, c]);
    expect(grouped.get('42:1')).toEqual([b]);
  });
});

describe('ClassificationScreen before a case is picked', () => {
  beforeEach(() => setup(null));

  afterEach(() => verifyHttp());

  it('requests no line items and shows a hint — not an error — on entry', () => {
    httpMock.expectOne(COUNTRIES_URL).flush(COUNTRIES);
    fixture.detectChanges();

    httpMock.expectNone(LINE_ITEMS_URL);
    expect(fixture.nativeElement.querySelector('.form-message--error')).toBeNull();
    expect(fixture.nativeElement.querySelector('.products-loading')).toBeNull();
    expect(fixture.nativeElement.querySelector('.products-empty td')?.textContent?.trim()).toBe(
      'בחר תיק עמילות מהרשימה כדי להציג את פריטי חשבון הספק שלו',
    );
    const submit = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('does not render the old Order/CCF picker', () => {
    httpMock.expectOne(COUNTRIES_URL).flush(COUNTRIES);
    expect(fixture.nativeElement.querySelector('app-filing-context-picker')).toBeNull();
    expect(
      Array.from(
        fixture.nativeElement.querySelectorAll('.section-title') as NodeListOf<HTMLElement>,
      ).map((el) => el.textContent?.trim()),
    ).toEqual(['סיווג', 'תיקי עמילות שלא עברו סיווג', 'מוצרים']);
  });

  it('loads the line items once a case is picked', () => {
    httpMock.expectOne(COUNTRIES_URL).flush(COUNTRIES);

    filingContext.context.set({ kind: 'order', id: ORDER_ID });
    fixture.detectChanges();

    httpMock.expectOne(LINE_ITEMS_URL).flush([lineItem()]);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement.querySelector('#goodsDescription') as HTMLInputElement).value,
    ).toBe('Light Fixtures');
    expect(fixture.nativeElement.querySelectorAll('.documents-table tbody tr').length).toBe(1);
  });
});

describe('ClassificationScreen', () => {
  beforeEach(() => setup(ORDER_ID));

  afterEach(() => verifyHttp());

  /** Lets ngModel hand values to the PrimeNG controls (it does so asynchronously), then re-renders. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Answers the country lookup the screen requests on construction. */
  function flushCountries(countries: CountryDto[] = COUNTRIES): void {
    httpMock.expectOne(COUNTRIES_URL).flush(countries);
    fixture.detectChanges();
  }

  async function flushLineItems(items: InvoiceLineItemDto[]): Promise<void> {
    httpMock.expectOne(LINE_ITEMS_URL).flush(items);
    await settle();
  }

  /**
   * Cell content per row: a PrimeNG select yields its model value, an input
   * its value, a multi-select its summary label, anything else its text.
   * The notes column is left out — the notes tests cover it.
   */
  function rows(): string[][] {
    return fixture.debugElement.queryAll(By.css('.documents-table tbody tr')).map((tr) =>
      tr.queryAll(By.css('td:not(.col-notes)')).map((td) => {
        const select = td.query(By.directive(Select));
        if (select) {
          const value = (select.componentInstance as Select).modelValue();
          return value === null || value === undefined ? '' : String(value);
        }
        const summary = td.query(By.css('.p-multiselect-label'));
        if (summary) return (summary.nativeElement as HTMLElement).textContent?.trim() ?? '';
        const input = td.query(By.css('input'));
        if (input) return (input.nativeElement as HTMLInputElement).value;
        return (td.nativeElement as HTMLElement).textContent?.trim() ?? '';
      }),
    );
  }

  const headers = (): string[] =>
    Array.from(
      fixture.nativeElement.querySelectorAll(
        '.documents-table thead tr:last-child th:not(.col-notes)',
      ) as NodeListOf<HTMLElement>,
    ).map((th) => th.textContent?.trim() ?? '');
  const goodsDescription = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('#goodsDescription');
  const tradeSelects = (): DebugElement[] =>
    fixture.debugElement.queryAll(By.css('p-select.trade-agreement-select'));
  const codeInputs = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.classification-code-input'));
  const multiSelects = (cls: 'approvals-select' | 'licenses-select'): MultiSelect[] =>
    fixture.debugElement
      .queryAll(By.css(`app-multi-select.${cls}`))
      .map((de) => de.componentInstance as MultiSelect);
  const countrySelects = (): DebugElement[] =>
    fixture.debugElement.queryAll(By.css('p-select.country-select'));
  const optionsOf = (select: DebugElement): { value: unknown; label?: string; name?: string }[] =>
    (select.componentInstance as Select).options as { value: unknown; label?: string; name?: string }[];
  const submitButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button[type="submit"]');
  const addRowButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.products-add');

  /** Picks a value in a PrimeNG select the way it reports one: through its ngModelChange. */
  async function choose(select: DebugElement, value: unknown): Promise<void> {
    select.triggerEventHandler('ngModelChange', value);
    await settle();
  }

  /** Ticks one more option in a row's multi-select. */
  async function tick(multi: MultiSelect, value: string): Promise<void> {
    multi.onChange([...multi.selected(), value]);
    await settle();
  }

  async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  it('shows the loading line while the line items are being fetched', async () => {
    flushCountries();
    expect(fixture.nativeElement.querySelector('.products-loading')?.textContent?.trim()).toBe(
      'טוען פריטים…',
    );
    expect(fixture.nativeElement.querySelector('.products-empty')).toBeNull();

    await flushLineItems([]);

    expect(fixture.nativeElement.querySelector('.products-loading')).toBeNull();
  });

  it('renders the line items without a product-name column and moves the names into תיאור טובין', async () => {
    flushCountries();
    const req = httpMock.expectOne(LINE_ITEMS_URL);
    expect(req.request.method).toBe('GET');
    req.flush([
      lineItem(),
      // Cast: the extractor may leave numbers unknown; the screen must render blanks for them.
      lineItem({
        lineIndex: 1,
        item: 'ABC-1',
        description: 'Cable',
        quantity: null,
        price: null,
        total: null,
      }),
    ]);
    fixture.detectChanges();

    expect(headers()).toEqual([
      'מק"ט',
      'כמות',
      'מחיר ליחידה',
      'מחיר כללי',
      'הסכם סחר',
      'קוד סיווג',
      'אישורים',
      'רישיונות',
      'מדינות',
    ]);
    expect(rows()).toEqual([
      ['Y8022-140BK', '15', '15.32', '229.80', '', '', 'ללא', 'ללא', ''],
      ['ABC-1', '', '', '', '', '', 'ללא', 'ללא', ''],
    ]);
    expect(goodsDescription().value).toBe('Light Fixtures, Cable');
    expect(fixture.nativeElement.querySelector('.products-empty')).toBeNull();
    expect(fixture.nativeElement.querySelector('.form-message--error')).toBeNull();
  });

  it('pre-fills the columns from a saved classification', async () => {
    flushCountries();
    await flushLineItems([
      lineItem({
        classification: {
          tradeAgreement: TradeAgreement.EU,
          classificationCode: '8539.50.00',
          approvals: [
            ClassificationApproval.STANDARD_OR_DECLARATION,
            ClassificationApproval.COSMETICS,
          ],
          licenses: [ClassificationLicense.VEHICLE_PARTS_TRADE],
          countryId: 162,
        },
      }),
    ]);

    expect(rows()).toEqual([
      [
        'Y8022-140BK',
        '15',
        '15.32',
        '229.80',
        'eu',
        '8539.50.00',
        '2 נבחרו',
        'רישיון לסחר במוצרי תעבורה (0212)',
        '162',
      ],
    ]);
  });

  it('shows the empty-state row when the case has no line items', async () => {
    flushCountries();
    await flushLineItems([]);

    const empty = fixture.nativeElement.querySelector('.products-empty td') as HTMLTableCellElement;
    expect(empty).toBeTruthy();
    expect(empty.colSpan).toBe(10);
    expect(empty.textContent?.trim()).toBe(
      'לא נמצאו פריטים מחשבון ספק — העלה חשבון ספק במסך תיוק ניירת יבוא',
    );
    expect(goodsDescription().value).toBe('');
  });

  it('shows the error line when loading fails', async () => {
    flushCountries();
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

  it('addRow appends an empty row that renders blank cells', async () => {
    flushCountries();
    await flushLineItems([]);

    addRowButton().click();
    await settle();

    expect(rows()).toEqual([['', '', '', '', '', '', 'ללא', 'ללא', '']]);
  });

  it('offers every trade agreement in Hebrew and keeps a choice on its own row', async () => {
    flushCountries();
    await flushLineItems([lineItem(), lineItem({ lineIndex: 1, item: 'B' })]);

    const [first] = tradeSelects();
    const options = optionsOf(first).map((o) => [o.value, o.label]);
    expect(first.nativeElement.textContent.trim()).toBe('בחר הסכם');
    expect(options).toHaveLength(19);
    expect(options).toContainEqual([TradeAgreement.USA, 'ארה"ב']);
    expect(options).toContainEqual([TradeAgreement.ARGENTINA_MERCOSUR, 'ארגנטינה -- מרקוסור']);

    await choose(first, TradeAgreement.USA);
    expect(rows()[0][4]).toBe(TradeAgreement.USA);
    expect(rows()[1][4]).toBe('');
  });

  it('offers the sixteen approvals as a multi-select and summarises the ticked ones', async () => {
    flushCountries();
    await flushLineItems([lineItem(), lineItem({ lineIndex: 1, item: 'B' })]);

    const [first] = multiSelects('approvals-select');
    expect(first.ariaLabel()).toBe('אישורים לשורה 1');
    const labels = first.options().map((o) => o.label);
    expect(labels).toHaveLength(16);
    expect(labels[0]).toBe('אישור הגנת הצומח');
    expect(labels).toContain('ת"ר/הצהרה');
    expect(labels).toContain('אישור משרד הביטחון - היחידה לרישוי יבוא אמל"ח');
    expect(labels[15]).toBe('אישור מעבדה מוסמכת לרכב');

    await tick(first, ClassificationApproval.COSMETICS);
    expect(rows()[0][6]).toBe('אישור תמרוקים');

    await tick(multiSelects('approvals-select')[0], ClassificationApproval.FOOD_SERVICE);
    expect(rows()[0][6]).toBe('2 נבחרו');
    expect(rows()[1][6]).toBe('ללא');
  });


  it('offers the ten licenses as a multi-select and keeps the ticked ones on their own row', async () => {
    flushCountries();
    await flushLineItems([lineItem(), lineItem({ lineIndex: 1, item: 'B' })]);

    const [first] = multiSelects('licenses-select');
    expect(first.ariaLabel()).toBe('רישיונות לשורה 1');
    const labels = first.options().map((o) => o.label);
    expect(labels).toHaveLength(10);
    expect(labels[0]).toBe('רישיון מינהל התעשיות (משרד הכלכלה)');
    expect(labels).toContain('רישיון תחבורה – (משרד התחבורה - אגף צמ"א)');
    expect(labels[9]).toBe('רישיון משרד הבריאות – (משרד הבריאות - אגף הרוקחות)');

    await tick(first, ClassificationLicense.MINAMATA_COMMISSIONER);
    expect(rows()[0][7]).toBe('רישיון הממונה לפי תקנות מינמטה (0608) (המשרד להגנת הסביבה)');
    expect(rows()[1][7]).toBe('ללא');
  });


  it('renders the countries dropdown from the lookup endpoint and keeps a choice on its own row', async () => {
    flushCountries();
    await flushLineItems([lineItem(), lineItem({ lineIndex: 1, item: 'B' })]);

    const [first] = countrySelects();
    expect(first.nativeElement.textContent.trim()).toBe('בחר מדינה');
    expect(optionsOf(first).map((c) => c.name)).toEqual(['ישראל', 'נורווגיה']);

    await choose(first, 162);
    expect(rows()[0][8]).toBe('162');
    expect(rows()[1][8]).toBe('');
  });


  it('shows an error line and an options-less dropdown when the country lookup fails', async () => {
    httpMock
      .expectOne(COUNTRIES_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Internal Server Error' });
    await flushLineItems([lineItem()]);

    const errors = Array.from(
      fixture.nativeElement.querySelectorAll('.form-message--error') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent?.trim());
    expect(errors).toEqual(['טעינת רשימת המדינות נכשלה']);
    expect(optionsOf(countrySelects()[0])).toEqual([]);
  });

  it('PUTs the classification of every invoice-backed row on שמור סיווג and shows the refreshed rows', async () => {
    flushCountries();
    await flushLineItems([lineItem(), lineItem({ lineIndex: 1, item: 'B', description: 'Cable' })]);

    await choose(tradeSelects()[0], TradeAgreement.CANADA);
    await typeInto(codeInputs()[0], ' 8539.50.00 ');
    await tick(multiSelects('approvals-select')[0], ClassificationApproval.MEDICAL_DEVICES);
    await tick(multiSelects('licenses-select')[0], ClassificationLicense.AGRICULTURE_FOREIGN_TRADE);
    await choose(countrySelects()[0], 106);

    // A hand-added row has nowhere to be stored and must not be sent.
    addRowButton().click();
    await settle();

    submitButton().click();
    fixture.detectChanges();

    const req = httpMock.expectOne(SAVE_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      items: [
        {
          fileId: 42,
          lineIndex: 0,
          tradeAgreement: TradeAgreement.CANADA,
          classificationCode: '8539.50.00',
          approvals: [ClassificationApproval.MEDICAL_DEVICES],
          licenses: [ClassificationLicense.AGRICULTURE_FOREIGN_TRADE],
          countryId: 106,
        },
        {
          fileId: 42,
          lineIndex: 1,
          tradeAgreement: null,
          classificationCode: '',
          approvals: [],
          licenses: [],
          countryId: null,
        },
      ],
    });
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent?.trim()).toBe('שומר…');

    req.flush([
      lineItem({
        classification: {
          tradeAgreement: TradeAgreement.CANADA,
          classificationCode: '8539.50.00',
          approvals: [ClassificationApproval.MEDICAL_DEVICES],
          licenses: [ClassificationLicense.AGRICULTURE_FOREIGN_TRADE],
          countryId: 106,
        },
      }),
      lineItem({ lineIndex: 1, item: 'B', description: 'Cable' }),
    ]);
    httpMock.expectOne(PENDING_CCFS_URL).flush([]);
    await settle();

    expect(fixture.nativeElement.querySelector('.form-message--success')?.textContent?.trim()).toBe(
      'הסיווג נשמר (2 שורות)',
    );
    expect(submitButton().disabled).toBe(false);
    expect(rows()).toEqual([
      [
        'Y8022-140BK',
        '15',
        '15.32',
        '229.80',
        'canada',
        '8539.50.00',
        'אישור אמ"ר',
        'רישיון חקלאות (משרד החקלאות - המרכז לסחר חוץ)',
        '106',
      ],
      ['B', '15', '15.32', '229.80', '', '', 'ללא', 'ללא', ''],
      ['', '', '', '', '', '', 'ללא', 'ללא', ''],
    ]);
  });

  it('shows an error line when saving fails and keeps the edited rows', async () => {
    flushCountries();
    await flushLineItems([lineItem()]);
    await typeInto(codeInputs()[0], '1234');

    submitButton().click();
    fixture.detectChanges();
    httpMock
      .expectOne(SAVE_URL)
      .flush({ message: 'boom' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.form-message--error')?.textContent?.trim()).toBe(
      'שמירת הסיווג נכשלה',
    );
    expect(fixture.nativeElement.querySelector('.form-message--success')).toBeNull();
    expect(codeInputs()[0].value).toBe('1234');
    expect(submitButton().disabled).toBe(false);
  });
});

describe('ClassificationScreen pending-CCF list', () => {
  const CCF_LINE_ITEMS_URL = '/api/import-files/line-items?ccfId=7';

  beforeEach(() =>
    setup(null, [
      pendingCcf(),
      pendingCcf({
        id: 8,
        fileNumber: 'CCF1008',
        shipmentFileMblNumber: null,
        customerNames: [],
        lineCount: 0,
        classifiedLineCount: 0,
      }),
    ]),
  );

  afterEach(() => verifyHttp());

  const items = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.pending-ccfs__item'));

  it('lists every pending CCF with its number, progress, MBL and customers', () => {
    httpMock.expectOne(COUNTRIES_URL).flush(COUNTRIES);
    fixture.detectChanges();

    const spans = (b: HTMLButtonElement): string[] =>
      Array.from(b.querySelectorAll('span')).map((el) => el.textContent?.trim() ?? '');
    expect(items().map(spans)).toEqual([
      ['CCF1007', '1/4', 'MBL-1', 'ACME Ltd.'],
      ['CCF1008', '—'],
    ]);
    expect(items().some((b) => b.classList.contains('active'))).toBe(false);
  });

  it('picking a CCF from the list loads its line items and highlights it', () => {
    httpMock.expectOne(COUNTRIES_URL).flush(COUNTRIES);

    items()[0].click();
    fixture.detectChanges();

    expect(filingContext.context()).toEqual({ kind: 'ccf', id: 7 });
    httpMock.expectOne(CCF_LINE_ITEMS_URL).flush([lineItem()]);
    fixture.detectChanges();
    expect(items()[0].classList.contains('active')).toBe(true);
    expect(items()[0].getAttribute('aria-pressed')).toBe('true');
    expect(items()[1].classList.contains('active')).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('.documents-table tbody tr').length).toBe(1);
  });

  it('refreshes the list after a successful save', () => {
    httpMock.expectOne(COUNTRIES_URL).flush(COUNTRIES);
    items()[0].click();
    fixture.detectChanges();
    httpMock.expectOne(CCF_LINE_ITEMS_URL).flush([lineItem()]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    httpMock.expectOne('/api/import-files/line-items/classification?ccfId=7').flush([lineItem()]);
    httpMock.expectOne(PENDING_CCFS_URL).flush([pendingCcf({ id: 8, fileNumber: 'CCF1008' })]);
    fixture.detectChanges();

    expect(items().map((b) => b.querySelector('.pending-ccfs__number')?.textContent)).toEqual([
      'CCF1008',
    ]);
    // The just-classified CCF stays open even though it left the list.
    expect(filingContext.context()).toEqual({ kind: 'ccf', id: 7 });
  });
});

describe('ClassificationScreen pending-CCF list failure', () => {
  beforeEach(() => setup(null, 'error'));

  afterEach(() => verifyHttp());

  it('shows an error line instead of the list', () => {
    httpMock.expectOne(COUNTRIES_URL).flush(COUNTRIES);
    fixture.detectChanges();

    expect(
      fixture.nativeElement
        .querySelector('.pending-ccfs .form-message--error')
        ?.textContent?.trim(),
    ).toBe('טעינת רשימת התיקים נכשלה');
    expect(fixture.nativeElement.querySelector('.pending-ccfs__item')).toBeNull();
  });
});

describe('ClassificationScreen row notes', () => {
  const NOTES_URL = `${NOTES_PATH}?orderId=${ORDER_ID}`;

  beforeEach(async () => {
    await setup(ORDER_ID);
    httpMock.expectOne(COUNTRIES_URL).flush(COUNTRIES);
    httpMock
      .expectOne(LINE_ITEMS_URL)
      .flush([lineItem(), lineItem({ lineIndex: 1, item: 'ABC-1', description: 'Cable' })]);
    const req = httpMock.expectOne(NOTES_URL);
    expect(req.request.method).toBe('GET');
    req.flush([note({ id: 1 }), note({ id: 2, body: 'שנייה' })]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => verifyHttp());

  const noteButtons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('td.col-notes button'));
  const dialog = (): LineItemNotesDialog | null =>
    (fixture.debugElement.query(By.directive(LineItemNotesDialog))?.componentInstance as
      | LineItemNotesDialog
      | undefined) ?? null;

  it('shows a notes button on every row, with the count of stored notes', () => {
    const buttons = noteButtons();
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent?.trim()).toBe('2');
    expect(buttons[1].textContent?.trim()).toBe('');
  });

  it('opens the popup with the row\'s existing notes and closes it again', async () => {
    noteButtons()[0].click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const opened = dialog();
    expect(opened).not.toBeNull();
    expect(opened?.notes().map((n) => n.body)).toEqual(['לבדוק מול הספק', 'שנייה']);
    expect(opened?.fileId()).toBe(42);
    expect(opened?.lineIndex()).toBe(0);

    opened?.closed.emit();
    fixture.detectChanges();
    expect(dialog()).toBeNull();
  });

  it('POSTs a new note and adds it to the row', async () => {
    noteButtons()[1].click();
    fixture.detectChanges();
    await fixture.whenStable();

    const textarea = document.querySelector('#line-item-note-input') as HTMLTextAreaElement;
    textarea.value = '  חדש  ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    (document.querySelector('.p-dialog form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );

    const req = httpMock.expectOne(NOTES_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ fileId: 42, lineIndex: 1, body: 'חדש' });
    req.flush(note({ id: 9, lineIndex: 1, body: 'חדש' }));
    fixture.detectChanges();

    expect(dialog()?.notes().map((n) => n.body)).toEqual(['חדש']);
    expect(noteButtons()[1].textContent?.trim()).toBe('1');
  });

  it('disables the notes button on rows added by hand', async () => {
    (fixture.nativeElement.querySelector('.products-add') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(noteButtons()[2].disabled).toBe(true);
  });
});
