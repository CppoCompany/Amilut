import { Location } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';

import { Destination, Incoterm, OrderStatus, PaymentTerms, ShipmentType } from '../../../../api/enums';
import type { OrderDto } from '../../../../api/models';
import { NavigationService } from '../../navigation.service';
import { provideWorkspaceTestRouting, settleNavigation } from '../../navigation.testing';
import { MyOrdersScreen } from './my-orders';

// `*cdkVirtualFor` never renders rows in this jsdom test environment (no
// existing spec for this screen or `MyFilesScreen`, its only sibling using
// the same viewport, works around that either) — exercised via the
// component's own row handlers instead, the same way `order.spec.ts` drives
// `OrderScreen` through its protected methods rather than simulated clicks.
type MyOrdersInternals = {
  onImportDocuments: (order: OrderDto, event: Event) => void;
  onEditOrder: (order: OrderDto) => void;
};

const ORDER_WITH_CASE: OrderDto = {
  id: 1001,
  customerId: 3,
  customerName: 'ACME Ltd.',
  handlerUserId: 7,
  handlerName: 'דנה לוי',
  createdAt: '2026-09-01T08:30:00.000Z',
  updatedAt: '2026-09-01T08:30:00.000Z',
  status: OrderStatus.PREPARING,
  shipmentType: ShipmentType.SEA,
  paymentTerms: PaymentTerms.PREPAID,
  incoterm: Incoterm.CFR,
  destination: Destination.ASHDOD,
  supplierId: null,
  supplierName: null,
  factoryReadyDate: null,
  factoryPickupDate: null,
  departureDate: null,
  etaDate: null,
  shippingLine: null,
  voyageNumber: null,
  airline: null,
  flightNumber: null,
  isActive: true,
  mblId: 7,
};

const ORDER_WITHOUT_CASE: OrderDto = { ...ORDER_WITH_CASE, id: 1002, mblId: null };

describe('MyOrdersScreen', () => {
  let fixture: ComponentFixture<MyOrdersScreen>;
  let internals: MyOrdersInternals;
  let httpMock: HttpTestingController;
  let nav: NavigationService;
  let location: Location;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyOrdersScreen],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideWorkspaceTestRouting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    nav = TestBed.inject(NavigationService);
    location = TestBed.inject(Location);
    // Hosts a real `<router-outlet>` (via `WorkspaceSlugStub`) so a later
    // `nav.openFilingForCase`/`openOrderForEdit` actually activates the route
    // and runs `applyUrl` — without it, `router.navigate` only updates the
    // URL, never the `editOrderId`/`filingCaseId` hand-off signals.
    await RouterTestingHarness.create('/workspace/my-orders');

    fixture = TestBed.createComponent(MyOrdersScreen);
    internals = fixture.componentInstance as unknown as MyOrdersInternals;
    fixture.detectChanges();
    httpMock.expectOne((req) => req.url === '/api/orders').flush([ORDER_WITH_CASE, ORDER_WITHOUT_CASE]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('"ייבוא מסמכים" navigates to filing with the order\'s case preselected, and never bubbles into the row\'s own (dblclick) edit handler', async () => {
    const event = new Event('click');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');

    internals.onImportDocuments(ORDER_WITH_CASE, event);
    await settleNavigation();

    expect(stopPropagation).toHaveBeenCalled();
    expect(location.path()).toBe('/workspace/filing?caseId=7');
    expect(nav.filingCaseId()).toBe(7);
  });

  it('navigates to filing with no case preselected when the order has none yet', async () => {
    internals.onImportDocuments(ORDER_WITHOUT_CASE, new Event('click'));
    await settleNavigation();

    expect(location.path()).toBe('/workspace/filing');
    expect(nav.filingCaseId()).toBeNull();
  });

  it('double-clicking the row still opens the order for edit, unchanged', async () => {
    internals.onEditOrder(ORDER_WITH_CASE);
    await settleNavigation();

    expect(location.path()).toBe(`/workspace/order?orderId=${ORDER_WITH_CASE.id}`);
    expect(nav.editOrderId()).toBe(ORDER_WITH_CASE.id);
  });
});
