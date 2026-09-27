import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { CountryDto } from './models';

const BASE_URL = '/api/countries';

/** Thin HTTP wrapper over the countries lookup endpoint (bearer token is added by the auth interceptor). */
@Injectable({ providedIn: 'root' })
export class CountriesApi {
  private readonly http = inject(HttpClient);

  /** The full country list (Hebrew name + ISO alpha-2 key), ordered by name on the server. */
  list(): Observable<CountryDto[]> {
    return this.http.get<CountryDto[]>(BASE_URL);
  }
}
