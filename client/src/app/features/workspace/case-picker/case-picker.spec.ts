import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MblShippingType, MblStatus, SeaMethod } from '../../../api/enums';
import type { MblSummaryDto } from '../../../api/models';
import { CurrentCaseService } from '../current-case.service';
import { CasePicker } from './case-picker';

const CASES_URL = '/api/mbl';

function mblCase(overrides: Partial<MblSummaryDto> = {}): MblSummaryDto {
  return {
    id: 7,
    shippingType: MblShippingType.SEA,
    seaMethod: SeaMethod.FCL_FCL,
    status: MblStatus.OPEN,
    mblNumber: 'MBL-7',
    carrierName: null,
    handlerUserId: null,
    handlerName: null,
    hblCount: 1,
    orderCount: 0,
    orderIds: [],
    customerNames: ['ACME Ltd.'],
    createdAt: '2026-09-01T08:30:00.000Z',
    ...overrides,
  };
}

describe('CasePicker', () => {
  let fixture: ComponentFixture<CasePicker>;
  let httpMock: HttpTestingController;
  let currentCase: CurrentCaseService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CasePicker],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    currentCase = TestBed.inject(CurrentCaseService);
  });

  afterEach(() => httpMock.verify());

  function create(): void {
    fixture = TestBed.createComponent(CasePicker);
    fixture.detectChanges();
  }

  function flushCases(cases: MblSummaryDto[]): void {
    const req = httpMock.expectOne((r) => r.url === CASES_URL);
    expect(req.request.params.get('limit')).toBe('200');
    req.flush(cases);
    fixture.detectChanges();
  }

  const picker = (): HTMLSelectElement => fixture.nativeElement.querySelector('select#casePicker');
  const options = (): string[] =>
    Array.from(picker().options).map((o) => o.textContent?.trim() ?? '');
  const hint = (): string | undefined =>
    fixture.nativeElement.querySelector('.hint-text')?.textContent?.trim();
  const error = (): string | undefined =>
    fixture.nativeElement.querySelector('.form-message--error')?.textContent?.trim();

  it('lists the cases with whatever of number / MBL / customers each has, and nothing picked', () => {
    create();
    expect(options()).toEqual(['טוען תיקים…']);

    flushCases([
      mblCase(),
      mblCase({ id: 8, mblNumber: null, customerNames: ['ACME Ltd.', 'Globex'] }),
      mblCase({ id: 9, mblNumber: null, customerNames: [] }),
    ]);

    expect(options()).toEqual([
      'בחר תיק',
      'תיק 7 · MBL-7 · ACME Ltd.',
      'תיק 8 · ACME Ltd., Globex',
      'תיק 9',
    ]);
    expect(picker().value).toBe('');
    expect(currentCase.caseId()).toBeNull();
    expect(hint()).toBe('יש לבחור תיק כדי להציג את הנתונים שלו');
    expect(error()).toBeUndefined();
  });

  it('writes the picked case to CurrentCaseService and clears it on the placeholder', () => {
    create();
    flushCases([mblCase(), mblCase({ id: 8 })]);

    picker().value = '8';
    picker().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(currentCase.caseId()).toBe(8);
    expect(hint()).toBeUndefined();

    picker().value = '';
    picker().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(currentCase.caseId()).toBeNull();
  });

  it('shows a case picked earlier (on another screen) as selected', () => {
    currentCase.caseId.set(8);
    create();
    flushCases([mblCase(), mblCase({ id: 8 })]);

    expect(picker().value).toBe('8');
    expect(currentCase.caseId()).toBe(8);
  });

  it('drops a picked case that no longer exists', () => {
    currentCase.caseId.set(99);
    create();
    flushCases([mblCase()]);

    expect(currentCase.caseId()).toBeNull();
    expect(picker().value).toBe('');
  });

  it('points to the create-case screen when there are no cases', () => {
    create();
    flushCases([]);

    expect(options()).toEqual(['בחר תיק']);
    expect(hint()).toBe('אין עדיין תיקי שילוח — צור תיק במסך יצירת תיק שילוח');
  });

  it('shows an error when the case list cannot be loaded', () => {
    create();
    httpMock
      .expectOne((r) => r.url === CASES_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(error()).toBe('טעינת רשימת התיקים נכשלה');
    expect(hint()).toBeUndefined();
  });
});
