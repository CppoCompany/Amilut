import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { DocumentStatus } from './enums';
import type {
  CreateHblArrivalDto,
  CreateHblDto,
  HblArrivalDto,
  HblDto,
  HblLinkHistoryEntryDto,
  UpdateHblDto,
} from './models';

/**
 * Thin HTTP client over the HBL REST resource (`/api/hbl`).
 * Shapes come from the generated OpenAPI schema (see `./models.ts`); the bearer
 * token is attached by the auth interceptor.
 */
@Injectable({ providedIn: 'root' })
export class HblApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/hbl';

  /** All HBLs under one MBL, ordered by sequence — the sidebar's data source. */
  findByMblId(mblId: number): Observable<HblDto[]> {
    const params = new HttpParams().set('mblId', String(mblId));
    return this.http.get<HblDto[]>(this.baseUrl, { params });
  }

  /** Air HAWBs not linked to any MAWB yet, newest first. */
  listUnassigned(): Observable<HblDto[]> {
    const params = new HttpParams().set('unassigned', 'true');
    return this.http.get<HblDto[]>(this.baseUrl, { params });
  }

  getById(id: number): Observable<HblDto> {
    return this.http.get<HblDto>(`${this.baseUrl}/${id}`);
  }

  create(dto: CreateHblDto): Observable<HblDto> {
    return this.http.post<HblDto>(this.baseUrl, dto);
  }

  update(id: number, dto: UpdateHblDto): Observable<HblDto> {
    return this.http.patch<HblDto>(`${this.baseUrl}/${id}`, dto);
  }

  /** Replaces the full set of orders associated with an HBL. Empty array is valid. */
  updateOrders(id: number, orderIds: number[]): Observable<HblDto> {
    return this.http.patch<HblDto>(`${this.baseUrl}/${id}/orders`, { orderIds });
  }

  /** Air: link / move / detach (`mblId: null`). After an arrival a `reason` is required. */
  linkToMaster(id: number, mblId: number | null, reason?: string): Observable<HblDto> {
    return this.http.patch<HblDto>(`${this.baseUrl}/${id}/master`, { mblId, reason });
  }

  linkHistory(id: number): Observable<HblLinkHistoryEntryDto[]> {
    return this.http.get<HblLinkHistoryEntryDto[]>(`${this.baseUrl}/${id}/link-history`);
  }

  /** Moving the document status backwards needs a `reason`. */
  changeDocumentStatus(id: number, status: DocumentStatus, reason?: string): Observable<HblDto> {
    return this.http.patch<HblDto>(`${this.baseUrl}/${id}/document-status`, { status, reason });
  }

  listArrivals(id: number): Observable<HblArrivalDto[]> {
    return this.http.get<HblArrivalDto[]>(`${this.baseUrl}/${id}/arrivals`);
  }

  addArrival(id: number, dto: CreateHblArrivalDto): Observable<HblDto> {
    return this.http.post<HblDto>(`${this.baseUrl}/${id}/arrivals`, dto);
  }

  voidArrival(id: number, arrivalId: number, reason: string): Observable<HblDto> {
    return this.http.post<HblDto>(`${this.baseUrl}/${id}/arrivals/${arrivalId}/void`, { reason });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
