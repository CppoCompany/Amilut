import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { MblStatus } from './enums';
import type {
  CreateMblDto,
  MblDto,
  MblSummaryDto,
  PagedMblSummaryDto,
  UpdateMblDto,
} from './models';
import { PagedQueryParams, toHttpParams } from './paging';

/** Query parameters accepted by `GET /api/mbl` — the "התיקים שלי" grid. */
export interface ListMblParams {
  customerId?: number;
  carrierName?: string;
  caseNumber?: number;
  limit?: number;
  offset?: number;
}

/** Sort keys accepted by `GET /api/mbl/paged` (whitelisted server-side). */
export type MblSortKey = 'id' | 'mblNumber' | 'carrierName' | 'status' | 'createdAt';

/**
 * Query parameters accepted by `GET /api/mbl/paged`. One endpoint serves three
 * list pages: `mine=true` → "התיקים שלי", `status=in_release` → "תיקים בהתרה",
 * neither → "תהליכי יבוא".
 */
export interface PagedMblParams extends PagedQueryParams {
  /** Only cases opened by the signed-in user. */
  mine?: boolean;
  status?: MblStatus;
  customerId?: number;
  carrierName?: string;
  sort?: MblSortKey;
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

  /** `GET /api/mbl/paged` — one page of shipping cases, filtered/sorted server-side. */
  listPaged(params: PagedMblParams = {}): Observable<PagedMblSummaryDto> {
    return this.http.get<PagedMblSummaryDto>(`${this.baseUrl}/paged`, {
      params: toHttpParams(params),
    });
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
