import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';

import { Router } from '@angular/router';

import { CcfStatus, MblShippingType, OrderStatus } from '../../../../api/enums';
import type {
  DashboardImportProcessRowDto,
  DashboardResponseDto,
  NotificationDto,
} from '../../../../api/models';
import { NavigationService } from '../../navigation.service';
import { NotificationsStateService } from '../../notifications-state.service';
import { provideWorkspaceTestRouting, settleNavigation } from '../../navigation.testing';
import { DASHBOARD_LIST_ROW_IDS, DashboardScreen } from './dashboard';

const DASHBOARD_URL = '/api/dashboard';
const NOTIFICATIONS_URL = '/api/notifications';
const READ_ALL_URL = '/api/notifications/read-all';

const MESSAGES: NotificationDto[] = [
  {
    id: 12,
    message: 'נפתח תיק סליקת מכס חדש, מקושר לתיק שילוח 5',
    relatedCcfId: 7,
    actorUserId: 3,
    actorName: 'Dana',
    isRead: false,
    createdAt: '2026-09-06T08:30:00.000Z',
  },
  {
    id: 9,
    message: 'הודעה ישנה',
    relatedCcfId: null,
    actorUserId: null,
    actorName: null,
    isRead: true,
    createdAt: '2026-09-01T08:30:00.000Z',
  },
];

/** `mbl.status` wire value → its generated type, without depending on the enum's member names. */
function mblStatus(value: string): DashboardImportProcessRowDto['status'] {
  return value as DashboardImportProcessRowDto['status'];
}

const EMPTY: DashboardResponseDto = {
  myOrders: [],
  casesInRelease: [],
  ccfsPendingClassification: [],
  ccfs: [],
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
  ccfsPendingClassification: [
    {
      id: 7,
      fileNumber: 'CCF1007',
      shipmentFileId: 5,
      shipmentFileMblNumber: 'MBL-5',
      customerNames: ['ACME'],
      status: CcfStatus.OPEN,
      lineCount: 4,
      classifiedLineCount: 1,
      createdAt: '2026-09-03T08:30:00.000Z',
    },
  ],
  ccfs: [
    {
      id: 8,
      fileNumber: 'CCF1008',
      shipmentFileId: null,
      shipmentFileMblNumber: null,
      customerNames: [],
      status: CcfStatus.CLOSED,
      lineCount: 0,
      classifiedLineCount: 0,
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
      providers: [provideHttpClient(), provideHttpClientTesting(), provideWorkspaceTestRouting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    nav = TestBed.inject(NavigationService);
    await RouterTestingHarness.create('/workspace/dashboard');
    fixture = TestBed.createComponent(DashboardScreen);
    fixture.detectChanges();
    // The "הודעות" widget's own request — empty unless a test re-creates the
    // screen with messages (see `createWithMessages`).
    httpMock.expectOne({ method: 'GET', url: NOTIFICATIONS_URL }).flush([]);
    fixture.detectChanges();
  });

  /** A fresh dashboard whose "הודעות" request returns `messages`. */
  function createWithMessages(messages: NotificationDto[]): void {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY); // the beforeEach instance's own load
    fixture.destroy();
    fixture = TestBed.createComponent(DashboardScreen);
    fixture.detectChanges();
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);
    httpMock.expectOne(NOTIFICATIONS_URL).flush(messages);
    fixture.detectChanges();
  }

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

  it('shows the title, the three actions and six cards in a loading state before the response arrives', () => {
    expect(host().querySelector('.page-title')?.textContent?.trim()).toBe('איזור האישי');
    expect(buttonByText('הזמנה חדשה')).toBeTruthy();
    expect(buttonByText('תהליך יבוא חדש')).toBeTruthy();
    expect(buttonByText('תיק עמילות חדש')).toBeTruthy();
    expect(cardTitles()).toEqual([
      'הודעות',
      'ההזמנות שלי',
      'תיקים בהתרה',
      'תיקי עמילות שלא עברו סיווג',
      'תיקי עמילות',
      'תהליכי יבוא',
    ]);
    const loadingTexts = Array.from(host().querySelectorAll<HTMLElement>('.data-table__empty')).map(
      (el) => el.textContent?.trim(),
    );
    // The widget's (empty) messages already arrived in beforeEach.
    expect(loadingTexts).toEqual(['אין הודעות', 'טוען...', 'טוען...', 'טוען...', 'טוען...', 'טוען...']);

    httpMock.expectOne({ method: 'GET', url: DASHBOARD_URL }).flush(EMPTY);
  });

  it('renders the Hebrew empty state in every card when there are no rows', () => {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);
    fixture.detectChanges();

    const emptyTexts = Array.from(host().querySelectorAll<HTMLElement>('.data-table__empty')).map(
      (el) => el.textContent?.trim(),
    );
    expect(emptyTexts).toEqual(['אין הודעות', ...Array(5).fill('אין נתונים להצגה')]);
    expect(host().querySelector('table')).toBeNull();
  });

  it('renders one grid per card with Hebrew labels for statuses and shipping types', () => {
    httpMock.expectOne(DASHBOARD_URL).flush(FULL);
    fixture.detectChanges();

    const orders = card('myOrders');
    expect(orders.querySelector('tbody tr')?.textContent).toContain('1001');
    expect(orders.querySelector('.status-tag--waiting_at_port')?.textContent?.trim()).toBe(
      'ממתינה בנמל',
    );

    const release = card('casesInRelease');
    expect(release.querySelector('tbody tr')?.textContent).toContain('ACME, Globex');
    expect(release.querySelector('.status-tag--in_release')?.textContent?.trim()).toBe('בהתרה');

    const pending = card('ccfsPendingClassification');
    const pendingCells = Array.from(pending.querySelectorAll<HTMLElement>('tbody td')).map((td) =>
      td.textContent?.trim(),
    );
    expect(pendingCells.slice(0, 4)).toEqual(['CCF1007', 'MBL-5', 'ACME', '1/4']);

    const ccfs = card('ccfs');
    const ccfCells = Array.from(ccfs.querySelectorAll<HTMLElement>('tbody td')).map((td) =>
      td.textContent?.trim(),
    );
    expect(ccfCells.slice(0, 4)).toEqual(['CCF1008', '—', '—', '—']);
    expect(ccfs.querySelector('.status-tag--closed')?.textContent?.trim()).toBe('סגור');

    const processes = card('importProcesses');
    expect(processes.querySelector('tbody tr')?.textContent).toContain('MBL-7');
    expect(processes.querySelector('tbody tr')?.textContent).toContain('ימי');
    expect(processes.querySelector('.status-tag--released')?.textContent?.trim()).toBe('שוחרר');
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

  it('"הזמנה חדשה" opens the existing create-order screen as a fresh draft', async () => {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);
    const before = nav.newOrderRequested();

    buttonByText('הזמנה חדשה').click();
    await settleNavigation();

    expect(nav.activeScreen()).toBe('order');
    expect(nav.isChildActive('ws-order')).toBe(true);
    expect(nav.newOrderRequested()).toBe(before + 1);
  });

  it('"תהליך יבוא חדש" opens the existing shipping-case wizard as a fresh draft', async () => {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);
    const before = nav.newCaseRequested();

    buttonByText('תהליך יבוא חדש').click();
    await settleNavigation();

    expect(nav.activeScreen()).toBe('shipmentCaseWizard');
    expect(nav.isChildActive('ws-shipment')).toBe(true);
    expect(nav.newCaseRequested()).toBe(before + 1);
  });

  it('"צפה בהכל" opens the matching "רשימות" list page', async () => {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);

    card('myOrders').querySelector<HTMLButtonElement>('.dashboard-card__link')!.click();
    await settleNavigation();

    expect(nav.activeScreen()).toBe('listMyOrders');
    expect(nav.isChildActive(DASHBOARD_LIST_ROW_IDS.myOrders)).toBe(true);
  });

  it('every card links to its own list page', async () => {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);

    const expected: Record<keyof typeof DASHBOARD_LIST_ROW_IDS, string> = {
      myOrders: 'listMyOrders',
      casesInRelease: 'listCasesInRelease',
      ccfsPendingClassification: 'listMyClassifications',
      ccfs: 'listMyCases',
      importProcesses: 'listImportProcesses',
    };
    for (const [cardKey, screen] of Object.entries(expected)) {
      card(cardKey).querySelector<HTMLButtonElement>('.dashboard-card__link')!.click();
      await settleNavigation();
      expect(nav.activeScreen()).toBe(screen);
    }
  });

  function clickFirstRow(cardName: string): void {
    card(cardName).querySelector<HTMLTableRowElement>('tbody tr')!.click();
  }

  it('clicking an order opens that order for editing', async () => {
    httpMock.expectOne(DASHBOARD_URL).flush(FULL);
    fixture.detectChanges();

    clickFirstRow('myOrders');
    await settleNavigation();

    expect(TestBed.inject(Router).url).toBe('/workspace/order?orderId=1001');
    expect(nav.activeScreen()).toBe('order');
    expect(nav.editOrderId()).toBe(1001);
  });

  it('clicking a CCF pending classification opens the classification screen scoped to it', async () => {
    httpMock.expectOne(DASHBOARD_URL).flush(FULL);
    fixture.detectChanges();

    clickFirstRow('ccfsPendingClassification');
    await settleNavigation();

    expect(TestBed.inject(Router).url).toBe('/workspace/classification?ccfId=7');
    expect(nav.activeScreen()).toBe('classification');
    expect(nav.openClassificationContext()).toEqual({ kind: 'ccf', id: 7 });
  });

  it('clicking a CCF opens the CCF screen with that file loaded', async () => {
    httpMock.expectOne(DASHBOARD_URL).flush(FULL);
    fixture.detectChanges();

    clickFirstRow('ccfs');
    await settleNavigation();

    expect(TestBed.inject(Router).url).toBe('/workspace/ccf?ccfId=8');
    expect(nav.activeScreen()).toBe('ccf');
    expect(nav.viewCcfId()).toBe(8);
  });

  it('clicking an import process opens its shipment file for editing', async () => {
    httpMock.expectOne(DASHBOARD_URL).flush(FULL);
    fixture.detectChanges();

    clickFirstRow('importProcesses');
    await settleNavigation();

    expect(TestBed.inject(Router).url).toBe('/workspace/shipment?caseId=7');
    expect(nav.activeScreen()).toBe('shipmentCaseWizard');
    expect(nav.editCaseId()).toBe(7);
  });

  it('"תיק עמילות חדש" opens the existing Customs Clearance File screen', async () => {
    httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);

    buttonByText('תיק עמילות חדש').click();
    await settleNavigation();

    expect(TestBed.inject(Router).url).toBe('/workspace/ccf');
    expect(nav.activeScreen()).toBe('ccf');
    expect(nav.isChildActive('ws-ccf')).toBe(true);
  });

  describe('"הודעות" widget', () => {
    let state: NotificationsStateService;

    beforeEach(() => {
      state = TestBed.inject(NotificationsStateService);
    });

    function messageRows(): HTMLTableRowElement[] {
      return Array.from(card('messages').querySelectorAll<HTMLTableRowElement>('tbody tr'));
    }

    it('lists every notification with its details and the user who triggered it', () => {
      createWithMessages(MESSAGES);
      httpMock.expectOne(READ_ALL_URL).flush({ count: 0 });

      const cells = messageRows().map((row) =>
        Array.from(row.querySelectorAll('td')).map((td) => td.textContent?.trim()),
      );
      expect(cells.length).toBe(2);
      expect(cells[0][0]).toBe('נפתח תיק סליקת מכס חדש, מקושר לתיק שילוח 5');
      expect(cells[0][1]).toBe('Dana');
      expect(cells[1][1]).toBe('—');
    });

    it('marks what it showed as read (up to the newest id) and clears the badge count', () => {
      state.unreadCount.set(1);
      createWithMessages(MESSAGES);

      const req = httpMock.expectOne(READ_ALL_URL);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ upToId: 12 });
      req.flush({ count: 0 });
      fixture.detectChanges();

      expect(state.unreadCount()).toBe(0);
      // Still highlighted as new on this visit, even though it is now read.
      expect(messageRows()[0].classList.contains('dashboard-message--unread')).toBe(true);
      expect(messageRows()[1].classList.contains('dashboard-message--unread')).toBe(false);
    });

    it('does not call read-all when every notification is already read', () => {
      createWithMessages([MESSAGES[1]]);
      httpMock.expectNone(READ_ALL_URL);
    });

    it('re-fetches and marks read when the poll finds new notifications while the dashboard is open', () => {
      httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);

      state.unreadCount.set(1);
      fixture.detectChanges();

      httpMock.expectOne(NOTIFICATIONS_URL).flush([MESSAGES[0]]);
      httpMock.expectOne(READ_ALL_URL).flush({ count: 0 });
      fixture.detectChanges();
      expect(messageRows().length).toBe(1);
      expect(state.unreadCount()).toBe(0);
    });

    it('clicking a message about a CCF opens that CCF', async () => {
      createWithMessages(MESSAGES);
      httpMock.expectOne(READ_ALL_URL).flush({ count: 0 });

      messageRows()[0].click();
      await settleNavigation();

      expect(TestBed.inject(Router).url).toBe('/workspace/ccf?ccfId=7');
      expect(nav.viewCcfId()).toBe(7);
    });

    it('shows an error with a retry button when the list fails to load', () => {
      httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);
      fixture.destroy();
      fixture = TestBed.createComponent(DashboardScreen);
      fixture.detectChanges();
      httpMock.expectOne(DASHBOARD_URL).flush(EMPTY);
      httpMock.expectOne(NOTIFICATIONS_URL).flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(card('messages').querySelector('[role="alert"]')?.textContent).toContain('טעינת ההודעות נכשלה');

      card('messages').querySelector<HTMLButtonElement>('.dashboard-retry')!.click();
      httpMock.expectOne(NOTIFICATIONS_URL).flush([]);
      fixture.detectChanges();
      expect(card('messages').querySelector('[role="alert"]')).toBeNull();
    });
  });
});
