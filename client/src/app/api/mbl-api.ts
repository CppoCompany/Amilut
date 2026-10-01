import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { CreateMblDto, MblDto, UpdateMblDto } from './models';

/**
 * Thin HTTP client over the MBL REST resource (`/api/mbl`).
 * Shapes come from the generated OpenAPI schema (see `./models.ts`); the bearer
 * token is attached by the auth interceptor.
 */
@Injectable({ providedIn: 'root' })
export class MblApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/mbl';

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
