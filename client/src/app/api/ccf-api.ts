import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { CcfStatus } from './enums';
import type { CcfDto, CreateCcfDto, NextCcfFileNumberDto } from './models';

/** Query parameters accepted by `GET /api/ccf` — the Order/CCF picker's data source. */
export interface ListCcfParams {
  status?: CcfStatus;
  shipmentFileId?: number;
  limit?: number;
}

/**
 * Thin HTTP client over the Customs Clearance File REST resource (`/api/ccf`).
 * Shapes come from the generated OpenAPI schema (see `./models.ts`); the bearer
 * token is attached by the auth interceptor.
 */
@Injectable({ providedIn: 'root' })
export class CcfApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/ccf';

  list(params: ListCcfParams = {}): Observable<CcfDto[]> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return this.http.get<CcfDto[]>(this.baseUrl, { params: httpParams });
  }

  create(dto: CreateCcfDto): Observable<CcfDto> {
    return this.http.post<CcfDto>(this.baseUrl, dto);
  }

  /** Preview of the number the next create will most likely get — not reserved. */
  peekNextFileNumber(): Observable<NextCcfFileNumberDto> {
    return this.http.get<NextCcfFileNumberDto>(`${this.baseUrl}/next-file-number`);
  }

  getById(id: number): Observable<CcfDto> {
    return this.http.get<CcfDto>(`${this.baseUrl}/${id}`);
  }
}
