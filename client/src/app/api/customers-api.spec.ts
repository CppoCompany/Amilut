import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CustomersApi } from './customers-api';
import type { CustomerDto } from './models';

const ACME: CustomerDto = {
  id: 1,
  name: 'Acme Imports Ltd.',
  address: null,
  phone: null,
  email: null,
  isActive: true,
};

describe('CustomersApi', () => {
  let api: CustomersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CustomersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('search builds GET /api/customers?q=..&limit=..', () => {
    let result: CustomerDto[] | undefined;
    api.search('acm').subscribe((r) => (result = r));

    const req = http.expectOne((r) => r.url === '/api/customers');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('q')).toBe('acm');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.urlWithParams).toBe('/api/customers?q=acm&limit=20');

    req.flush([ACME]);
    expect(result).toEqual([ACME]);
  });

  it('search forwards a custom limit', () => {
    api.search('acme', 5).subscribe();
    const req = http.expectOne((r) => r.url === '/api/customers');
    expect(req.request.params.get('limit')).toBe('5');
    req.flush([]);
  });

  it('getById calls GET /api/customers/:id', () => {
    api.getById(7).subscribe();
    const req = http.expectOne('/api/customers/7');
    expect(req.request.method).toBe('GET');
    req.flush({ ...ACME, id: 7 });
  });

  it('create posts the dto to /api/customers', () => {
    const dto = { name: 'New Co', address: null, phone: '050', email: null };
    let created: CustomerDto | undefined;
    api.create(dto).subscribe((c) => (created = c));

    const req = http.expectOne('/api/customers');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({ ...ACME, id: 9, name: 'New Co' });
    expect(created?.id).toBe(9);
  });
});
