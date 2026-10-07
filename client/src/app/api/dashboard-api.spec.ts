import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DashboardApi } from './dashboard-api';
import type { DashboardResponseDto } from './models';

const EMPTY: DashboardResponseDto = {
  myOrders: [],
  casesInRelease: [],
  myClassifications: [],
  myCases: [],
  importProcesses: [],
};

describe('DashboardApi', () => {
  let api: DashboardApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DashboardApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the dashboard with GET /api/dashboard and no query params', () => {
    let result: DashboardResponseDto | undefined;

    api.get().subscribe((response) => (result = response));

    const req = httpMock.expectOne('/api/dashboard');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(EMPTY);
    expect(result).toEqual(EMPTY);
  });
});
