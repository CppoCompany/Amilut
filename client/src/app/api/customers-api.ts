import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { CreateCustomerDto, CustomerDto } from './models';

const BASE_URL = '/api/customers';

/** Thin HTTP wrapper over the customers endpoints (bearer token is added by the auth interceptor). */
@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);

  /**
   * Search active customers by name (case-insensitive substring).
   * The server requires `q` to be at least 3 characters after trimming.
   */
  search(q: string, limit = 20): Observable<CustomerDto[]> {
    const params = new HttpParams().set('q', q).set('limit', limit);
    return this.http.get<CustomerDto[]>(BASE_URL, { params });
  }

  getById(id: number): Observable<CustomerDto> {
    return this.http.get<CustomerDto>(`${BASE_URL}/${id}`);
  }

  create(dto: CreateCustomerDto): Observable<CustomerDto> {
    return this.http.post<CustomerDto>(BASE_URL, dto);
  }
}
