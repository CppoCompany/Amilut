import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type {
  CreateShipmentDto,
  ShipmentDto,
  ShipmentSummaryDto,
  UpdateShipmentDto,
} from './models';

/** Query parameters accepted by `GET /api/shipments`. */
export interface ListShipmentsParams {
  customerId?: number;
  forwarderName?: string;
  caseNumber?: number;
  limit?: number;
  offset?: number;
}

/**
 * Thin HTTP client over the Shipments REST resource (`/api/shipments`).
 * Shapes come from the generated OpenAPI schema (see `./models.ts`); the bearer
 * token is attached by the auth interceptor.
 */
@Injectable({ providedIn: 'root' })
export class ShipmentsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/shipments';

  list(params: ListShipmentsParams = {}): Observable<ShipmentSummaryDto[]> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return this.http.get<ShipmentSummaryDto[]>(this.baseUrl, { params: httpParams });
  }

  getById(id: number): Observable<ShipmentDto> {
    return this.http.get<ShipmentDto>(`${this.baseUrl}/${id}`);
  }

  create(dto: CreateShipmentDto): Observable<ShipmentDto> {
    return this.http.post<ShipmentDto>(this.baseUrl, dto);
  }

  update(id: number, dto: UpdateShipmentDto): Observable<ShipmentDto> {
    return this.http.patch<ShipmentDto>(`${this.baseUrl}/${id}`, dto);
  }

  /** Replaces the full set of orders associated with a case. */
  updateOrders(id: number, orderIds: number[]): Observable<ShipmentDto> {
    return this.http.patch<ShipmentDto>(`${this.baseUrl}/${id}/orders`, { orderIds });
  }

  /** Hard delete — frees the case's orders back to unassigned. */
  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
