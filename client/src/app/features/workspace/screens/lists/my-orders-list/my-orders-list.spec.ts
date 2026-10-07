import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  Destination,
  Incoterm,
  OrderStatus,
  PaymentTerms,
  ShipmentType,
} from '../../../../../api/enums';
import type { OrderDto, PagedOrdersDto } from '../../../../../api/models';
import { SEARCH_DEBOUNCE_MS } from '../../../../customers/customer-autocomplete/customer-autocomplete';
import { NavigationService } from '../../../navigation.service';
import { ListStateService } from '../list-state.service';
import { MyOrdersListScreen } from './my-orders-list';

const ORDER: OrderDto = {
  id: 1001,
  customerId: 3,
  customerName: 'ACME',
  handlerUserId: 7,
  handlerName: 'Dana',
  createdAt: '2026-09-01T08:30:00.000Z',
  updatedAt: '2026-09-01T08:30:00.000Z',
  status: OrderStatus.WAITING_AT_PORT,
  shipmentType: ShipmentType.SEA,
  paymentTerms: PaymentTerms.PREPAID,
  incoterm: Incoterm.CFR,
  destination: Destination.ASHDOD,
  supplierId: null,
  supplierName: null,
  factoryReadyDate: null,
  factoryPickupDate: null,
  departureDate: null,
  etaDate: '2026-10-05',
  shippingLine: null,
  voyageNumber: null,
  airline: null,
  flightNumber: null,
  isActive: true,
};

const PAGE: PagedOrdersDto = { items: [ORDER], total: 1, page: 1, pageSize: 25 };

describe('MyOrdersListScreen ("ההזמנות שלי" list page)', () => {
  let fixture: ComponentFixture<MyOrdersListScreen>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyOrdersListScreen],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MyOrdersListScreen);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const expectPagedRequest = () => httpMock.expectOne((r) => r.url === '/api/orders/paged');
  const bodyRows = (): HTMLTableRowElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));
  const headerByLabel = (label: string): HTMLTableCellElement =>
    Array.from(fixture.nativeElement.querySelectorAll('thead th') as HTMLTableCellElement[]).find(
      (th) => th.textContent?.trim() === label,
    )!;

  /** Flushes change detection/effects, then lets `ms` of real time pass (the app is zoneless — no fakeAsync). */
  const settle = async (ms: number): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    fixture.detectChanges();
  };

  it('loads page 1 newest-first on init and renders the rows with Hebrew labels', () => {
    const req = expectPagedRequest();
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('sort')).toBe('createdAt');
    expect(req.request.params.get('dir')).toBe('desc');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('25');
    expect(req.request.params.has('q')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    expect(bodyRows()[0].textContent?.trim()).toBe('טוען...');

    req.flush(PAGE);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.section-title')?.textContent?.trim()).toBe('ההזמנות שלי');
    const cells = Array.from(bodyRows()[0].querySelectorAll('td')).map((td) => td.textContent?.trim());
    expect(cells[0]).toBe('1001');
    expect(cells[1]).toBe('ACME');
    expect(cells[3]).toBe('ממתינה בנמל');
    expect(bodyRows()[0].querySelector('.status-pill--waiting_at_port')).toBeTruthy();
  });

  it('re-fetches with the clicked column as sort and resets to page 1', () => {
    expectPagedRequest().flush(PAGE);
    fixture.detectChanges();

    headerByLabel('לקוח').click();
    fixture.detectChanges();

    const req = expectPagedRequest();
    expect(req.request.params.get('sort')).toBe('customerName');
    expect(req.request.params.get('dir')).toBe('asc');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(PAGE);
  });

  it('debounces filter typing, sends it as q/status and remembers it for the next visit', async () => {
    expectPagedRequest().flush(PAGE);
    fixture.detectChanges();

    const search: HTMLInputElement = fixture.nativeElement.querySelector('input[type="search"]');
    search.value = 'acme';
    search.dispatchEvent(new Event('input'));
    const status: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    status.value = OrderStatus.DEPARTED;
    status.dispatchEvent(new Event('change'));

    await settle(SEARCH_DEBOUNCE_MS / 2);
    httpMock.expectNone((r) => r.url === '/api/orders/paged');
    await settle(SEARCH_DEBOUNCE_MS);

    const req = expectPagedRequest();
    expect(req.request.params.get('q')).toBe('acme');
    expect(req.request.params.get('status')).toBe(OrderStatus.DEPARTED);
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ ...PAGE, items: [], total: 0 });
    fixture.detectChanges();
    expect(bodyRows()[0].textContent?.trim()).toBe('אין נתונים להצגה');

    const saved = TestBed.inject(ListStateService).get('listMyOrders', 'createdAt');
    expect(saved.q).toBe('acme');
    expect(saved.status).toBe(OrderStatus.DEPARTED);

    // A fresh instance (e.g. after visiting another screen) starts from the saved state.
    fixture.destroy();
    fixture = TestBed.createComponent(MyOrdersListScreen);
    fixture.detectChanges();
    const again = expectPagedRequest();
    expect(again.request.params.get('q')).toBe('acme');
    expect(again.request.params.get('status')).toBe(OrderStatus.DEPARTED);
    again.flush(PAGE);
  });

  it('"נקה" clears the filters and reloads without them', async () => {
    expectPagedRequest().flush(PAGE); // the beforeEach instance's own load
    TestBed.inject(ListStateService).set('listMyOrders', {
      q: 'acme',
      status: OrderStatus.DEPARTED,
      customer: null,
      caseNumber: '',
      from: '2026-01-01',
      to: '',
      sort: 'id',
      dir: 'asc',
      page: 2,
    });
    fixture.destroy();
    fixture = TestBed.createComponent(MyOrdersListScreen);
    fixture.detectChanges();
    const initial = expectPagedRequest();
    expect(initial.request.params.get('q')).toBe('acme');
    expect(initial.request.params.get('from')).toBe('2026-01-01');
    expect(initial.request.params.get('page')).toBe('2');
    initial.flush(PAGE);
    fixture.detectChanges();

    const clearButton: HTMLButtonElement = Array.from(
      fixture.nativeElement.querySelectorAll('button') as HTMLButtonElement[],
    ).find((b) => b.textContent?.trim() === 'נקה')!;
    clearButton.click();
    await settle(SEARCH_DEBOUNCE_MS + 50);

    const req = expectPagedRequest();
    expect(req.request.params.has('q')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.has('from')).toBe(false);
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('sort')).toBe('id'); // sort survives "נקה"
    req.flush(PAGE);
  });

  it('shows the error state when the request fails', () => {
    expectPagedRequest().flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'טעינת ההזמנות נכשלה',
    );
    expect(bodyRows()[0].textContent?.trim()).toBe('אין נתונים להצגה');
  });

  it('double-clicking a row opens that order for editing', () => {
    expectPagedRequest().flush(PAGE);
    fixture.detectChanges();

    bodyRows()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const nav = TestBed.inject(NavigationService);
    expect(nav.editOrderId()).toBe(1001);
    expect(nav.activeScreen()).toBe('order');
  });
});
