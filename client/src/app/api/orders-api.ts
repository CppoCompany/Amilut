import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { OrderStatus } from './enums';
import type { CreateOrderDto, OrderDto, UpdateOrderDto } from './models';

/** Query parameters accepted by `GET /api/orders`. */
export interface ListOrdersParams {
  customerId?: number;
  handlerUserId?: number;
  /** Substring match against the handler's name. */
  handlerName?: string;
  supplierId?: number;
  /** `false` matches orders with no shipping case yet; `true` matches the opposite. */
  hasCase?: boolean;
  status?: OrderStatus;
  /** Matches orders created on this calendar date (`YYYY-MM-DD`). */
  createdDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Thin HTTP client over the Orders REST resource (`/api/orders`).
 * Shapes come from the generated OpenAPI schema (see `./models.ts`); the bearer
 * token is attached by the auth interceptor.
 */
@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/orders';

  list(params: ListOrdersParams = {}): Observable<OrderDto[]> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return this.http.get<OrderDto[]>(this.baseUrl, { params: httpParams });
  }

  getById(id: number): Observable<OrderDto> {
    return this.http.get<OrderDto>(`${this.baseUrl}/${id}`);
  }

  create(dto: CreateOrderDto): Observable<OrderDto> {
    return this.http.post<OrderDto>(this.baseUrl, dto);
  }

  update(id: number, dto: UpdateOrderDto): Observable<OrderDto> {
    return this.http.patch<OrderDto>(`${this.baseUrl}/${id}`, dto);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
