import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Destination, Incoterm, OrderStatus, PaymentTerms, ShipmentType } from './enums';
import type { CreateOrderDto, OrderDto } from './models';
import { OrdersApi } from './orders-api';

const ORDER: OrderDto = {
  id: 1001,
  customerId: 3,
  customerName: 'ACME',
  handlerUserId: 7,
  handlerName: 'Dana',
  createdAt: '2026-09-01T08:30:00.000Z',
  updatedAt: '2026-09-01T08:30:00.000Z',
  status: OrderStatus.PREPARING,
  shipmentType: ShipmentType.SEA,
  paymentTerms: PaymentTerms.PREPAID,
  incoterm: Incoterm.CFR,
  destination: Destination.ASHDOD,
  factoryReadyDate: null,
  factoryPickupDate: null,
  departureDate: null,
  etaDate: null,
  shippingLine: null,
  voyageNumber: null,
  airline: null,
  flightNumber: null,
  isActive: true,
};

describe('OrdersApi', () => {
  let api: OrdersApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(OrdersApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('creates an order with POST /api/orders', () => {
    const dto: CreateOrderDto = {
      customerId: 3,
      status: OrderStatus.PREPARING,
      shipmentType: ShipmentType.SEA,
      paymentTerms: PaymentTerms.PREPAID,
      incoterm: Incoterm.CFR,
      destination: Destination.ASHDOD,
    };
    let result: OrderDto | undefined;

    api.create(dto).subscribe((order) => (result = order));

    const req = httpMock.expectOne('/api/orders');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush(ORDER);
    expect(result).toEqual(ORDER);
  });

  it('lists orders and omits undefined query params', () => {
    api.list({ customerId: 3, status: undefined, limit: undefined }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/orders');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual(['customerId']);
    expect(req.request.params.get('customerId')).toBe('3');
    req.flush([ORDER]);
  });

  it('lists orders with no params at all', () => {
    api.list().subscribe();
    const req = httpMock.expectOne('/api/orders');
    expect(req.request.params.keys()).toEqual([]);
    req.flush([]);
  });

  it('updates an order with PATCH /api/orders/:id', () => {
    api.update(1001, { status: OrderStatus.DEPARTED }).subscribe();
    const req = httpMock.expectOne('/api/orders/1001');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: OrderStatus.DEPARTED });
    req.flush(ORDER);
  });

  it('gets and removes an order by id', () => {
    api.getById(1001).subscribe();
    httpMock.expectOne({ method: 'GET', url: '/api/orders/1001' }).flush(ORDER);

    api.remove(1001).subscribe();
    httpMock
      .expectOne({ method: 'DELETE', url: '/api/orders/1001' })
      .flush(null, { status: 204, statusText: 'No Content' });
  });
});
