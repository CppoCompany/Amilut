import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { CreateMblDto, MblDto, MblSummaryDto, UpdateMblDto } from './models';

/** Query parameters accepted by `GET /api/mbl` — the "התיקים שלי" grid. */
export interface ListMblParams {
  customerId?: number;
  carrierName?: string;
  caseNumber?: number;
  limit?: number;
  offset?: number;
}

/**
 * Thin HTTP client over the MBL REST resource (`/api/mbl`).
 * Shapes come from the generated OpenAPI schema (see `./models.ts`); the bearer
 * token is attached by the auth interceptor.
 */
@Injectable({ providedIn: 'root' })
export class MblApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/mbl';

  list(params: ListMblParams = {}): Observable<MblSummaryDto[]> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return this.http.get<MblSummaryDto[]>(this.baseUrl, { params: httpParams });
  }

  getById(id: number): Observable<MblDto> {
    return this.http.get<MblDto>(`${this.baseUrl}/${id}`);
  }

  create(dto: CreateMblDto): Observable<MblDto> {
    return this.http.post<MblDto>(this.baseUrl, dto);
  }

  update(id: number, dto: UpdateMblDto): Observable<MblDto> {
    return this.http.patch<MblDto>(`${this.baseUrl}/${id}`, dto);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
