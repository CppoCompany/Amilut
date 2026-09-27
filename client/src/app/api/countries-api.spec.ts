import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CountriesApi } from './countries-api';
import type { CountryDto } from './models';

describe('CountriesApi', () => {
  let api: CountriesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CountriesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list GETs the countries lookup', () => {
    const countries: CountryDto[] = [
      { id: 106, name: 'ישראל', key: 'IL' },
      { id: 162, name: 'נורווגיה', key: 'NO' },
    ];
    let result: CountryDto[] | undefined;
    api.list().subscribe((r) => (result = r));

    const req = http.expectOne('/api/countries');
    expect(req.request.method).toBe('GET');

    req.flush(countries);
    expect(result).toEqual(countries);
  });
});
