import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { DashboardCcfRowDto, DashboardResponseDto } from './models';

/**
 * Thin HTTP client over the dashboard resource (`GET /api/dashboard`) — the
 * landing screen's five summary cards. Scoping to the signed-in user happens
 * server-side from the bearer token the auth interceptor attaches.
 */
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/dashboard';

  get(): Observable<DashboardResponseDto> {
    return this.http.get<DashboardResponseDto>(this.baseUrl);
  }

  /** Every CCF not fully classified yet, newest first — the classification screen's file list. */
  ccfsPendingClassification(): Observable<DashboardCcfRowDto[]> {
    return this.http.get<DashboardCcfRowDto[]>(`${this.baseUrl}/ccfs-pending-classification`);
  }
}
