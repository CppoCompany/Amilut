import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { CreateSupplierDto, SupplierDto } from './models';

const BASE_URL = '/api/suppliers';

/** Thin HTTP wrapper over the suppliers endpoints (bearer token is added by the auth interceptor). */
@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly http = inject(HttpClient);

  /**
   * Search active suppliers by name (case-insensitive substring).
   * The server requires `q` to be at least 3 characters after trimming.
   */
  search(q: string, limit = 20): Observable<SupplierDto[]> {
    const params = new HttpParams().set('q', q).set('limit', limit);
    return this.http.get<SupplierDto[]>(BASE_URL, { params });
  }

  getById(id: number): Observable<SupplierDto> {
    return this.http.get<SupplierDto>(`${BASE_URL}/${id}`);
  }

  create(dto: CreateSupplierDto): Observable<SupplierDto> {
    return this.http.post<SupplierDto>(BASE_URL, dto);
  }
}
