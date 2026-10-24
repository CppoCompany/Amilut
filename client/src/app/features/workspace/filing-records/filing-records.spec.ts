import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import {
  CcfStatus,
  Destination,
  Incoterm,
  OrderStatus,
  OrderStep,
  PaymentTerms,
  ShipmentType,
} from '../../../api/enums';
import type { CcfDto, OrderDto } from '../../../api/models';
import { SEA_CCF_HOUSE_FIELDS } from '../../../api/testing/sea-defaults';
import { FilingContextService } from '../filing-context.service';
import { FilingRecords } from './filing-records';
import { stubLayoutForVirtualScroll } from '../../../shared/testing/virtual-scroll';

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
    lastStep: OrderStep.CUSTOMER,
    isActive: true,
    mblId: null,
  };
}

function ccf(id: number, fileNumber: string): CcfDto {
  return {
    id,
    fileNumber,
    shipmentFileId: null,
    ...SEA_CCF_HOUSE_FIELDS,
    shipmentFileMblNumber: 'MBL-1',
    status: CcfStatus.OPEN,
    createdBy: 7,
    createdByName: 'דנה לוי',
    createdAt: '2026-09-01T08:30:00.000Z',
    updatedAt: '2026-09-01T08:30:00.000Z',
  };
}

describe('FilingRecords', () => {
  let fixture: ComponentFixture<FilingRecords>;
  let httpMock: HttpTestingController;
  let filingContext: FilingContextService;

  async function createFixture(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [FilingRecords],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    filingContext = TestBed.inject(FilingContextService);
    fixture = TestBed.createComponent(FilingRecords);
    fixture.detectChanges();
  }

  function flushLists(
    orders: OrderDto[] = [order(1000), order(1001)],
    ccfs: CcfDto[] = [ccf(7, 'CCF1007')],
  ): void {
    httpMock.expectOne((req) => req.url === ORDERS_URL).flush(orders);
    httpMock.expectOne((req) => req.url === CCFS_URL).flush(ccfs);
    fixture.detectChanges();
  }

  /** Lets PrimeNG's virtual scroller lay out its rows — it does so on a timer. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 5));
    fixture.detectChanges();
  }

  function tabs(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('p-tab'));
  }

  function activeTabLabel(): string | undefined {
    return tabs()
      .find((tab) => tab.getAttribute('aria-selected') === 'true')
      ?.textContent?.trim();
  }

  /** Data rows of the visible tab panel's table. */
  function rows(): HTMLTableRowElement[] {
    const panel = Array.from(fixture.nativeElement.querySelectorAll('p-tabpanel')).find(
      (el) => (el as HTMLElement).getAttribute('data-p-active') === 'true',
    ) as HTMLElement | undefined;
    return Array.from(panel?.querySelectorAll('tbody tr[tabindex]') ?? []);
  }

  function selectedRows(): HTMLTableRowElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('tr.data-table__row--selected'));
  }

  beforeEach(() => stubLayoutForVirtualScroll());

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('loads both lists and opens on the orders tab with nothing selected', async () => {
    await createFixture();
    flushLists();
    await settle();

    expect(activeTabLabel()).toContain('הזמנות');
    expect(rows().map((row) => row.cells[0].textContent?.trim())).toEqual(['1000', '1001']);
    expect(selectedRows()).toHaveLength(0);
  });

  it('clicking an order row selects and highlights it', async () => {
    await createFixture();
    flushLists();
    await settle();

    rows()[1].click();
    await settle();

    expect(filingContext.context()).toEqual({ kind: 'order', id: 1001 });
    expect(selectedRows().map((row) => row.cells[0].textContent?.trim())).toEqual(['1001']);

    rows()[0].click();
    await settle();
    expect(selectedRows().map((row) => row.cells[0].textContent?.trim())).toEqual(['1000']);
  });

  it('a context from outside opens its tab and highlights its row', async () => {
    await createFixture();
    filingContext.context.set({ kind: 'ccf', id: 7 });
    flushLists();
    await settle();

    expect(activeTabLabel()).toContain('תיקי עמילות');
    const selected = selectedRows();
    expect(selected).toHaveLength(1);
    expect(selected[0].cells[0].textContent?.trim()).toBe('CCF1007');
    expect(selected[0].getAttribute('aria-current')).toBe('true');
  });

  it('switching tabs clears the selection', async () => {
    await createFixture();
    flushLists();
    filingContext.context.set({ kind: 'order', id: 1000 });
    await settle();

    tabs()[1].click();
    await settle();

    expect(filingContext.context()).toBeNull();
    expect(activeTabLabel()).toContain('תיקי עמילות');

    rows()[0].click();
    await settle();
    expect(filingContext.context()).toEqual({ kind: 'ccf', id: 7 });
  });

  it('clears the selection if the picked record disappears from a refreshed list', async () => {
    await createFixture();
    filingContext.context.set({ kind: 'order', id: 999 });
    flushLists([order(1000)]);

    expect(filingContext.context()).toBeNull();
  });

  it('shows an error message when a list fails to load', async () => {
    await createFixture();
    httpMock
      .expectOne((req) => req.url === ORDERS_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne((req) => req.url === CCFS_URL).flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.form-message--error')?.textContent?.trim()).toBe(
      'טעינת רשימת ההזמנות נכשלה',
    );
  });
});
