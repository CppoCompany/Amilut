import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  Destination,
  Incoterm,
  OrderStatus,
  OrderStep,
  PaymentTerms,
  ShipmentType,
} from '../../../../api/enums';
import type { OrderDto, UploadedImportFileDto } from '../../../../api/models';
import { FilingContextService } from '../../filing-context.service';
import { NavigationService } from '../../navigation.service';
import { FilingScreen } from './filing';

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

describe('FilingScreen reached via NavigationService.openFilingContext hand-off', () => {
  it('preselects the context queued by openFilingFor, then clears the one-shot hand-off', () => {
    TestBed.configureTestingModule({
      imports: [FilingScreen],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    const nav = TestBed.inject(NavigationService);
    nav.openFilingContext.set({ kind: 'order', id: 1000 });
    const filingContext = TestBed.inject(FilingContextService);
    const httpMock = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(FilingScreen);
    fixture.detectChanges();

    expect(filingContext.context()).toEqual({ kind: 'order', id: 1000 });
    expect(nav.openFilingContext()).toBeNull();

    httpMock.expectOne((req) => req.url === ORDERS_URL).flush([order(1000)]);
    httpMock.expectOne((req) => req.url === CCFS_URL).flush([]);
    fixture.detectChanges();
    httpMock.expectOne((req) => req.url === '/api/import-files').flush([] as UploadedImportFileDto[]);
    httpMock.verify();
  });

  it('opens with nothing preselected when no hand-off was queued', () => {
    TestBed.configureTestingModule({
      imports: [FilingScreen],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    const filingContext = TestBed.inject(FilingContextService);
    const httpMock = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(FilingScreen);
    fixture.detectChanges();

    expect(filingContext.context()).toBeNull();
    httpMock.expectOne((req) => req.url === ORDERS_URL).flush([]);
    httpMock.expectOne((req) => req.url === CCFS_URL).flush([]);
    httpMock.verify();
  });
});

describe('FilingScreen', () => {
  let fixture: ComponentFixture<FilingScreen>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilingScreen],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FilingScreen);
    fixture.detectChanges();
    httpMock.expectOne((req) => req.url === ORDERS_URL).flush([order(1000)]);
    httpMock.expectOne((req) => req.url === CCFS_URL).flush([]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders the context picker and the import-files panel, scoped by the picker selection', () => {
    expect(fixture.nativeElement.querySelector('app-filing-context-picker')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-import-files-panel')).toBeTruthy();

    const select = fixture.nativeElement.querySelector(
      '.filing-context-picker select',
    ) as HTMLSelectElement;
    select.value = '1000';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    httpMock.expectOne((req) => req.url === '/api/import-files').flush([]);
  });
});
