import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MblShippingType, OrderStatus } from '../../../../api/enums';
import type { DashboardCaseRowDto, DashboardResponseDto } from '../../../../api/models';
import { NavigationService } from '../../navigation.service';
import { DASHBOARD_LIST_ROW_IDS, DashboardScreen } from './dashboard';

const DASHBOARD_URL = '/api/dashboard';

/** `mbl.status` wire value → its generated type, without depending on the enum's member names. */
function mblStatus(value: string): DashboardCaseRowDto['status'] {
  return value as DashboardCaseRowDto['status'];
}

const EMPTY: DashboardResponseDto = {
  myOrders: [],
  casesInRelease: [],
  myClassifications: [],
  myCases: [],
  importProcesses: [],
};

const FULL: DashboardResponseDto = {
  myOrders: [
    {
      id: 1001,
      customerName: 'ACME',
      handlerName: 'Dana',
      status: OrderStatus.WAITING_AT_PORT,
      createdAt: '2026-09-01T08:30:00.000Z',
    },
  ],
  casesInRelease: [
    {
      id: 5,
      mblNumber: 'MBL-5',
      customerNames: ['ACME', 'Globex'],
      carrierName: 'MAERSK',
      status: mblStatus('in_release'),
      createdAt: '2026-09-02T08:30:00.000Z',
    },
  ],
  myClassifications: [
    {
      fileId: 42,
      mblId: 1000,
      lineIndex: 0,
      item: 'Y8022-140BK',
      description: 'Light Fixtures',
      classificationCode: '9405.10.00',
      countryName: 'סין',
      createdAt: '2026-09-03T08:30:00.000Z',
    },
  ],
  myCases: [
    {
      id: 6,
      mblNumber: null,
      shippingType: MblShippingType.AIR,
      customerNames: [],
      carrierName: null,
      status: mblStatus('open'),
      createdAt: '2026-09-04T08:30:00.000Z',
    },
  ],
  importProcesses: [
    {
      id: 7,
      mblNumber: 'MBL-7',
      shippingType: MblShippingType.SEA,
      customerNames: ['Initech'],
      carrierName: 'ZIM',
      hblCount: 2,
      status: mblStatus('released'),
      createdAt: '2026-09-05T08:30:00.000Z',
    },
  ],
};

describe('DashboardScreen', () => {
  let fixture: ComponentFixture<DashboardScreen>;
  let httpMock: HttpTestingController;
  let nav: NavigationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardScreen],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    nav = TestBed.inject(NavigationService);
    fixture = TestBed.createComponent(DashboardScreen);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function card(name: string): HTMLElement {
    const el = host().querySelector<HTMLElement>(`[data-card="${name}"]`);
    if (!el) throw new Error(`card "${name}" not found`);
    return el;
  }

  function cardTitles(): string[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.dashboard-card__title')).map(
      (el) => el.textContent?.trim() ?? '',
    );
  }

  function buttonByText(text: string): HTMLButtonElement {
    const buttons = Array.from(host().querySelectorAll<HTMLButtonElement>('button'));
    const found = buttons.find((b) => b.textContent?.trim() === text);
    if (!found) throw new Error(`button "${text}" not found`);
    return found;
  }

  it('shows the title, the two actions and five cards in a loading state before the response arrives', () => {
    expect(host().querySelector('.page-title')?.textContent?.trim()).toBe('לוח בקרה');
    expect(buttonByText('הזמנה חדשה')).toBeTruthy();
    expect(buttonByText('תהליך יבוא חדש')).toBeTruthy();
    expect(cardTitles()).toEqual([
      'ההזמנות שלי',
      'תיקים בהתרה',
      'הסיווגים שלי',
      'התיקים שלי',
      'תהליכי יבוא',
    ]);
    const loadingTexts = Array.from(host().querySelectorAll<HTMLElement>('.data-table__empty')).map(
      (el) => el.textContent?.trim(),
    );
    expect(loadingTexts).toEqual(['טוען...', 'טוען...', 'טוען...', 'טוען...', 'טוען...']);

    httpMock.expectOne({ method: 'GET', url: DASHBOARD_URL }).flush(EMPTY);
  });

  it('renders the Hebrew empty state in every card when there are no rows', () => {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);
    fixture.detectChanges();

    const emptyTexts = Array.from(host().querySelectorAll<HTMLElement>('.data-table__empty')).map(
      (el) => el.textContent?.trim(),
    );
    expect(emptyTexts).toEqual(Array(5).fill('אין נתונים להצגה'));
    expect(host().querySelector('table')).toBeNull();
  });

  it('renders one grid per card with Hebrew labels for statuses and shipping types', () => {
    httpMock.expectOne(DASHBOARD_URL).flush(FULL);
    fixture.detectChanges();

    const orders = card('myOrders');
    expect(orders.querySelector('tbody tr')?.textContent).toContain('1001');
    expect(orders.querySelector('.status-pill--waiting_at_port')?.textContent?.trim()).toBe(
      'ממתינה בנמל',
    );

    const release = card('casesInRelease');
    expect(release.querySelector('tbody tr')?.textContent).toContain('ACME, Globex');
    expect(release.querySelector('.status-pill--in_release')?.textContent?.trim()).toBe('בהתרה');

    const classifications = card('myClassifications');
    expect(classifications.querySelector('tbody tr')?.textContent).toContain('9405.10.00');
    expect(classifications.querySelector('tbody tr')?.textContent).toContain('סין');

    const cases = card('myCases');
    const caseCells = Array.from(cases.querySelectorAll<HTMLElement>('tbody td')).map((td) =>
      td.textContent?.trim(),
    );
    expect(caseCells.slice(0, 4)).toEqual(['6', '—', 'אווירי', '—']);
    expect(cases.querySelector('.status-pill--open')?.textContent?.trim()).toBe('פתוח');

    const processes = card('importProcesses');
    expect(processes.querySelector('tbody tr')?.textContent).toContain('MBL-7');
    expect(processes.querySelector('tbody tr')?.textContent).toContain('ימי');
    expect(processes.querySelector('.status-pill--released')?.textContent?.trim()).toBe('שוחרר');
  });

  it('shows an error with a retry button when the request fails, and retries on click', () => {
    httpMock.expectOne(DASHBOARD_URL).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(host().querySelector('[role="alert"]')?.textContent).toContain('טעינת לוח הבקרה נכשלה');

    buttonByText('נסה שוב').click();
    fixture.detectChanges();
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);
    fixture.detectChanges();

    expect(host().querySelector('[role="alert"]')).toBeNull();
  });

  it('"הזמנה חדשה" opens the existing create-order screen as a fresh draft', () => {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);
    const before = nav.newOrderRequested();

    buttonByText('הזמנה חדשה').click();

    expect(nav.activeScreen()).toBe('order');
    expect(nav.isChildActive('ws-order')).toBe(true);
    expect(nav.newOrderRequested()).toBe(before + 1);
  });

  it('"תהליך יבוא חדש" opens the existing shipping-case wizard as a fresh draft', () => {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);
    const before = nav.newCaseRequested();

    buttonByText('תהליך יבוא חדש').click();

    expect(nav.activeScreen()).toBe('shipmentCaseWizard');
    expect(nav.isChildActive('ws-shipment')).toBe(true);
    expect(nav.newCaseRequested()).toBe(before + 1);
  });

  it('"צפה בהכל" opens the matching "רשימות" list page', () => {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);

    card('myOrders').querySelector<HTMLButtonElement>('.dashboard-card__link')!.click();

    expect(nav.activeScreen()).toBe('listMyOrders');
    expect(nav.isChildActive(DASHBOARD_LIST_ROW_IDS.myOrders)).toBe(true);
  });

  it('every card links to its own list page', () => {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);

    const expected: Record<keyof typeof DASHBOARD_LIST_ROW_IDS, string> = {
      myOrders: 'listMyOrders',
      casesInRelease: 'listCasesInRelease',
      myClassifications: 'listMyClassifications',
      myCases: 'listMyCases',
      importProcesses: 'listImportProcesses',
    };
    for (const [cardKey, screen] of Object.entries(expected)) {
      card(cardKey).querySelector<HTMLButtonElement>('.dashboard-card__link')!.click();
      expect(nav.activeScreen()).toBe(screen);
    }
  });
});
