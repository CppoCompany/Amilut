import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';

import {
  Destination,
  Incoterm,
  MblShippingType,
  MblStatus,
  OrderStatus,
  PaymentTerms,
  SeaMethod,
  ShipmentType,
} from '../../../api/enums';
import type { MblDto, OrderDto } from '../../../api/models';
import { NavigationService } from '../navigation.service';
import { provideWorkspaceTestRouting, settleNavigation } from '../navigation.testing';
import { SelectionStateService } from '../selection-state.service';
import { Breadcrumb } from './breadcrumb';

const ORDER: OrderDto = {
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
  mblId: null,
};

const MBL: MblDto = {
  id: 7,
  shippingType: MblShippingType.SEA,
  seaMethod: SeaMethod.FCL_FCL,
  customerId: null,
  customerName: null,
  mblNumber: 'MBL-007',
  bookingNumber: null,
  vesselName: null,
  voyageNumber: null,
  portOfLoading: null,
  portOfDischarge: null,
  finalDestination: null,
  shipperName: null,
  shipperAddress: null,
  consigneeName: null,
  consigneeAddress: null,
  notifyPartyName: null,
  notifyPartyAddress: null,
  containerNumber: null,
  containerSealNumber: null,
  cargoDescription: null,
  grossWeightKg: null,
  volumeCbm: null,
  freightTerms: null,
  receiptDeliveryType: null,
  placeOfIssue: null,
  dateOfIssue: null,
  carrierName: null,
  status: MblStatus.OPEN,
  handlerUserId: null,
  handlerName: null,
  containers: [],
  createdAt: '2026-09-01T08:30:00.000Z',
  updatedAt: '2026-09-01T08:30:00.000Z',
};

describe('Breadcrumb', () => {
  let fixture: ComponentFixture<Breadcrumb>;
  let nav: NavigationService;
  let selection: SelectionStateService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Breadcrumb],
      providers: [provideWorkspaceTestRouting()],
    });
    nav = TestBed.inject(NavigationService);
    selection = TestBed.inject(SelectionStateService);
    await RouterTestingHarness.create('/workspace/dashboard');
    fixture = TestBed.createComponent(Breadcrumb);
    fixture.detectChanges();
  });

  function trailText(): string {
    return fixture.nativeElement.querySelector('.breadcrumb-trail').textContent.replace(/\s+/g, ' ').trim();
  }

  function selectionBadge(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.breadcrumb-selection');
  }

  it('shows the default landing trail ("ראשי" + the top-level dashboard page, no group) with no selection badge', () => {
    expect(trailText()).toContain('ראשי');
    expect(trailText()).toContain('לוח בקרה');
    expect(trailText()).not.toContain('הזמנות');
    expect(selectionBadge()).toBeNull();
  });

  it('updates the trail reactively when navigation changes', async () => {
    const myFiles = nav.tree().flatMap((e) => ('children' in e ? e.children : [e])).find(
      (c) => c.page === 'myFiles',
    )!;
    nav.selectChild(myFiles);
    await settleNavigation();
    fixture.detectChanges();

    expect(trailText()).toContain('תיקי שילוח');
    expect(trailText()).toContain('התיקים שלי');
  });

  it('shows an order badge once an order is selected', () => {
    selection.selectOrder(ORDER);
    fixture.detectChanges();

    const badge = selectionBadge();
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain('1001');
    expect(badge!.textContent).toContain('ACME Ltd.');
  });

  it('replaces the order badge with a shipping-case badge when a case is selected, and back again', () => {
    selection.selectOrder(ORDER);
    fixture.detectChanges();
    expect(selectionBadge()!.textContent).toContain('1001');

    selection.selectShippingCase(MBL, []);
    fixture.detectChanges();
    expect(selectionBadge()!.textContent).toContain('MBL-007');
    expect(selectionBadge()!.textContent).not.toContain('1001');

    selection.selectOrder(ORDER);
    fixture.detectChanges();
    expect(selectionBadge()!.textContent).toContain('1001');
    expect(selectionBadge()!.textContent).not.toContain('MBL-007');
  });

  it('the clear button empties the selection and hides the badge', () => {
    selection.selectOrder(ORDER);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.breadcrumb-selection__clear') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(selection.selected()).toBeNull();
    expect(selectionBadge()).toBeNull();
  });
});
