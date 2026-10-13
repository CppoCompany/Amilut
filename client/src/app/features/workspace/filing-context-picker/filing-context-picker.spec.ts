import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  CcfStatus,
  Destination,
  Incoterm,
  OrderStatus,
  PaymentTerms,
  ShipmentType,
} from '../../../api/enums';
import type { CcfDto, OrderDto } from '../../../api/models';
import { FilingContextService } from '../filing-context.service';
import { FilingContextPicker } from './filing-context-picker';

const ORDERS_URL = '/api/orders';
const CCFS_URL = '/api/ccf';

function order(id: number): OrderDto {
  return {
    id,
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
}

function ccf(id: number, fileNumber: string): CcfDto {
  return {
    id,
    fileNumber,
    shipmentFileId: null,
    shipmentFileMblNumber: null,
    status: CcfStatus.OPEN,
    createdBy: 7,
    createdByName: 'דנה לוי',
    createdAt: '2026-09-01T08:30:00.000Z',
    updatedAt: '2026-09-01T08:30:00.000Z',
  };
}

describe('FilingContextPicker', () => {
  let fixture: ComponentFixture<FilingContextPicker>;
  let httpMock: HttpTestingController;
  let filingContext: FilingContextService;

  async function createFixture(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [FilingContextPicker],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    filingContext = TestBed.inject(FilingContextService);
    fixture = TestBed.createComponent(FilingContextPicker);
    fixture.detectChanges();
  }

  function flushOrders(orders: OrderDto[] = [order(1000), order(1001)]): void {
    httpMock.expectOne((req) => req.url === ORDERS_URL).flush(orders);
  }

  function flushCcfs(ccfs: CcfDto[] = [ccf(7, 'CCF1007')]): void {
    httpMock.expectOne((req) => req.url === CCFS_URL).flush(ccfs);
  }

  function kindButtons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.kind-toggle-btn'));
  }

  function activeSelect(): HTMLSelectElement {
    return fixture.nativeElement.querySelector('select');
  }

  afterEach(() => httpMock.verify());

  it('loads both orders and CCFs on construction and defaults to the order list', async () => {
    await createFixture();
    flushOrders();
    flushCcfs();
    fixture.detectChanges();

    const options = Array.from(activeSelect().options).map((o) => o.textContent?.trim());
    expect(options).toEqual(['בחר הזמנה', 'הזמנה 1000 · ACME Ltd.', 'הזמנה 1001 · ACME Ltd.']);
  });

  it('selecting an order writes it into FilingContextService', async () => {
    await createFixture();
    flushOrders();
    flushCcfs();
    fixture.detectChanges();

    activeSelect().value = '1000';
    activeSelect().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(filingContext.context()).toEqual({ kind: 'order', id: 1000 });
  });

  it('toggling to CCF switches the list and clears the current selection', async () => {
    await createFixture();
    flushOrders();
    flushCcfs();
    fixture.detectChanges();
    filingContext.context.set({ kind: 'order', id: 1000 });
    fixture.detectChanges();

    const [orderBtn, ccfBtn] = kindButtons();
    expect(orderBtn.classList.contains('active')).toBe(true);
    ccfBtn.click();
    fixture.detectChanges();

    expect(filingContext.context()).toBeNull(); // different id space — nothing carries over
    const options = Array.from(activeSelect().options).map((o) => o.textContent?.trim());
    expect(options).toEqual(['בחר תיק עמילות', 'תיק עמילות 7 · CCF1007']);

    activeSelect().value = '7';
    activeSelect().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(filingContext.context()).toEqual({ kind: 'ccf', id: 7 });
  });

  it('clears the selection if the picked order disappears from a refreshed list', async () => {
    await createFixture();
    filingContext.context.set({ kind: 'order', id: 999 });
    flushOrders([order(1000)]); // 999 is gone
    flushCcfs();
    fixture.detectChanges();

    expect(filingContext.context()).toBeNull();
  });

  it('clears the selection if the picked CCF disappears from a refreshed list', async () => {
    await createFixture();
    filingContext.context.set({ kind: 'ccf', id: 999 });
    flushOrders();
    flushCcfs([ccf(7, 'CCF1007')]); // 999 is gone
    fixture.detectChanges();

    expect(filingContext.context()).toBeNull();
  });

  it('shows an error message when a list fails to load', async () => {
    await createFixture();
    httpMock
      .expectOne((req) => req.url === ORDERS_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    flushCcfs();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.form-message--error')?.textContent?.trim()).toBe(
      'טעינת רשימת ההזמנות נכשלה',
    );
  });
});
