import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  ClassificationApproval,
  ClassificationLicense,
  TradeAgreement,
} from '../../../../api/enums';
import type { CountryDto, InvoiceLineItemDto } from '../../../../api/models';
import { CURRENT_CASE_NUMBER } from '../../current-case';
import { ClassificationScreen, goodsDescriptionOf } from './classification';

const LINE_ITEMS_URL = `/api/import-files/${CURRENT_CASE_NUMBER}/line-items`;
const SAVE_URL = `${LINE_ITEMS_URL}/classification`;
const COUNTRIES_URL = '/api/countries';

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

  /** Answers the country lookup the screen requests on construction. */
  function flushCountries(countries: CountryDto[] = COUNTRIES): void {
    httpMock.expectOne(COUNTRIES_URL).flush(countries);
    fixture.detectChanges();
  }

  function flushLineItems(items: InvoiceLineItemDto[]): void {
    httpMock.expectOne(LINE_ITEMS_URL).flush(items);
    fixture.detectChanges();
  }

  /**
   * Cell content per row: a `<select>`/`<input>` yields its value, the
   * approvals multi-select yields its summary text, anything else its text.
   */
  function rows(): string[][] {
    const trs = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.documents-table tbody tr',
      ) as NodeListOf<HTMLElement>,
    );
    return trs.map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => {
        const control = td.querySelector('select, input:not([type="checkbox"])');
        if (control) return (control as HTMLSelectElement | HTMLInputElement).value;
        const summary = td.querySelector('.multi-select__summary');
        return (summary ?? td).textContent?.trim() ?? '';
      }),
    );
  }

  const headers = (): string[] =>
    Array.from(
      fixture.nativeElement.querySelectorAll(
        '.documents-table thead th',
      ) as NodeListOf<HTMLElement>,
    ).map((th) => th.textContent?.trim() ?? '');
  const goodsDescription = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('#goodsDescription');
  const tradeSelects = (): HTMLSelectElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.trade-agreement-select'));
  const codeInputs = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.classification-code-input'));
  const approvalToggles = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.approvals-select .multi-select__toggle'));
  const countrySelects = (): HTMLSelectElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.country-select'));
  const submitButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button[type="submit"]');

  function change(
    control: HTMLSelectElement | HTMLInputElement,
    value: string,
    eventName = 'change',
  ): void {
    control.value = value;
    control.dispatchEvent(new Event(eventName));
    fixture.detectChanges();
  }

  it('shows the loading line while the line items are being fetched', () => {
    flushCountries();
    expect(fixture.nativeElement.querySelector('.products-loading')?.textContent?.trim()).toBe(
      'טוען פריטים…',
    );
    expect(fixture.nativeElement.querySelector('.products-empty')).toBeNull();

    flushLineItems([]);

    expect(fixture.nativeElement.querySelector('.products-loading')).toBeNull();
  });

  it('renders the line items without a product-name column and moves the names into תיאור טובין', () => {
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

  it('pre-fills the columns from a saved classification', () => {
    flushCountries();
    flushLineItems([
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

  it('shows the empty-state row when the case has no line items', () => {
    flushCountries();
    flushLineItems([]);

    const empty = fixture.nativeElement.querySelector('.products-empty td') as HTMLTableCellElement;
    expect(empty).toBeTruthy();
    expect(empty.colSpan).toBe(9);
    expect(empty.textContent?.trim()).toBe(
      'לא נמצאו פריטים מחשבון ספק — העלה חשבון ספק במסך תיוק ניירת יבוא',
    );
    expect(goodsDescription().value).toBe('');
  });

  it('shows the error line when loading fails', () => {
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

  it('addRow appends an empty row that renders blank cells', () => {
    flushCountries();
    flushLineItems([]);

    (fixture.nativeElement.querySelector('.btn-secondary') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(rows()).toEqual([['', '', '', '', '', '', 'ללא', 'ללא', '']]);
  });

  it('offers every trade agreement in Hebrew and keeps a choice on its own row', () => {
    flushCountries();
    flushLineItems([lineItem(), lineItem({ lineIndex: 1, item: 'B' })]);

    const [first, second] = tradeSelects();
    const options = Array.from(first.options).map((o) => [o.value, o.textContent?.trim()]);
    expect(options[0]).toEqual(['', 'בחר הסכם']);
    expect(options).toHaveLength(20);
    expect(options).toContainEqual([TradeAgreement.USA, 'ארה"ב']);
    expect(options).toContainEqual([TradeAgreement.ARGENTINA_MERCOSUR, 'ארגנטינה -- מרקוסור']);

    change(first, TradeAgreement.USA);
    expect(tradeSelects()[0].value).toBe(TradeAgreement.USA);
    expect(tradeSelects()[1].value).toBe('');
    expect(second.value).toBe('');
  });

  it('offers the sixteen approvals as a multi-select and summarises the ticked ones', () => {
    flushCountries();
    flushLineItems([lineItem(), lineItem({ lineIndex: 1, item: 'B' })]);

    const [first] = approvalToggles();
    expect(first.getAttribute('aria-label')).toBe('אישורים לשורה 1');
    first.click();
    fixture.detectChanges();

    const boxes = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.multi-select__menu input',
      ) as NodeListOf<HTMLInputElement>,
    );
    expect(boxes).toHaveLength(16);
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.multi-select__menu label',
      ) as NodeListOf<HTMLElement>,
    ).map((l) => l.textContent?.trim());
    expect(labels[0]).toBe('אישור הגנת הצומח');
    expect(labels).toContain('ת"ר/הצהרה');
    expect(labels).toContain('אישור משרד הביטחון - היחידה לרישוי יבוא אמל"ח');
    expect(labels[15]).toBe('אישור מעבדה מוסמכת לרכב');

    boxes.find((b) => b.value === ClassificationApproval.COSMETICS)!.click();
    fixture.detectChanges();
    expect(approvalToggles()[0].textContent?.trim()).toBe('אישור תמרוקים');

    boxes.find((b) => b.value === ClassificationApproval.FOOD_SERVICE)!.click();
    fixture.detectChanges();
    expect(approvalToggles()[0].textContent?.trim()).toBe('2 נבחרו');
    expect(approvalToggles()[1].textContent?.trim()).toBe('ללא');
  });

  it('offers the ten licenses as a multi-select and keeps the ticked ones on their own row', () => {
    flushCountries();
    flushLineItems([lineItem(), lineItem({ lineIndex: 1, item: 'B' })]);

    const toggles = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.licenses-select .multi-select__toggle',
      ) as NodeListOf<HTMLButtonElement>,
    );
    expect(toggles[0].getAttribute('aria-label')).toBe('רישיונות לשורה 1');
    toggles[0].click();
    fixture.detectChanges();

    const boxes = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.multi-select__menu input',
      ) as NodeListOf<HTMLInputElement>,
    );
    expect(boxes).toHaveLength(10);
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.multi-select__menu label',
      ) as NodeListOf<HTMLElement>,
    ).map((l) => l.textContent?.trim());
    expect(labels[0]).toBe('רישיון מינהל התעשיות (משרד הכלכלה)');
    expect(labels).toContain('רישיון תחבורה – (משרד התחבורה - אגף צמ"א)');
    expect(labels[9]).toBe('רישיון משרד הבריאות – (משרד הבריאות - אגף הרוקחות)');

    boxes.find((b) => b.value === ClassificationLicense.MINAMATA_COMMISSIONER)!.click();
    fixture.detectChanges();
    expect(rows()[0][7]).toBe('רישיון הממונה לפי תקנות מינמטה (0608) (המשרד להגנת הסביבה)');
    expect(rows()[1][7]).toBe('ללא');
  });

  it('renders the countries dropdown from the lookup endpoint and keeps a choice on its own row', () => {
    flushCountries();
    flushLineItems([lineItem(), lineItem({ lineIndex: 1, item: 'B' })]);

    const [first, second] = countrySelects();
    expect(Array.from(first.options).map((o) => [o.value, o.textContent?.trim()])).toEqual([
      ['', 'בחר מדינה'],
      ['106', 'ישראל'],
      ['162', 'נורווגיה'],
    ]);

    change(first, '162');
    expect(countrySelects()[0].value).toBe('162');
    expect(countrySelects()[1].value).toBe('');
    expect(second.value).toBe('');
  });

  it('shows an error line and an options-less dropdown when the country lookup fails', () => {
    httpMock
      .expectOne(COUNTRIES_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Internal Server Error' });
    flushLineItems([lineItem()]);

    const errors = Array.from(
      fixture.nativeElement.querySelectorAll('.form-message--error') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent?.trim());
    expect(errors).toEqual(['טעינת רשימת המדינות נכשלה']);
    expect(Array.from(countrySelects()[0].options).map((o) => o.value)).toEqual(['']);
  });

  it('PUTs the classification of every invoice-backed row on שמור סיווג and shows the refreshed rows', () => {
    flushCountries();
    flushLineItems([lineItem(), lineItem({ lineIndex: 1, item: 'B', description: 'Cable' })]);

    change(tradeSelects()[0], TradeAgreement.CANADA);
    change(codeInputs()[0], ' 8539.50.00 ', 'input');
    approvalToggles()[0].click();
    fixture.detectChanges();
    (
      Array.from(
        fixture.nativeElement.querySelectorAll(
          '.multi-select__menu input',
        ) as NodeListOf<HTMLInputElement>,
      ).find((b) => b.value === ClassificationApproval.MEDICAL_DEVICES) as HTMLInputElement
    ).click();
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '.licenses-select .multi-select__toggle',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    (
      Array.from(
        fixture.nativeElement.querySelectorAll(
          '.multi-select__menu input',
        ) as NodeListOf<HTMLInputElement>,
      ).find((b) => b.value === ClassificationLicense.AGRICULTURE_FOREIGN_TRADE) as HTMLInputElement
    ).click();
    fixture.detectChanges();
    change(countrySelects()[0], '106');

    // A hand-added row has nowhere to be stored and must not be sent.
    (fixture.nativeElement.querySelector('.btn-secondary') as HTMLButtonElement).click();
    fixture.detectChanges();

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
    fixture.detectChanges();

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

  it('shows an error line when saving fails and keeps the edited rows', () => {
    flushCountries();
    flushLineItems([lineItem()]);
    change(codeInputs()[0], '1234', 'input');

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
