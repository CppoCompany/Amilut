import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { ShipmentSummaryDto } from './models';

/** Query parameters accepted by `GET /api/shipments`. */
export interface ListShipmentsParams {
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
}
