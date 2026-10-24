import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import type { StatusEntityType } from './enums';
import type { AirportDto, CargoTerminalDto, StatusHistoryEntryDto, WeightRuleDto } from './models';

/**
 * Thin HTTP client over the air-freight lookups (`/api/air`) and the shared
 * status history (`/api/status-history`). The lookups rarely change, so the
 * airport / terminal lists are fetched once per session.
 */
@Injectable({ providedIn: 'root' })
export class AirApi {
  private readonly http = inject(HttpClient);

  private readonly importAirports$ = this.http
    .get<AirportDto[]>('/api/air/airports', { params: { importDestination: 'true' } })
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  private readonly cargoTerminals$ = this.http
    .get<CargoTerminalDto[]>('/api/air/cargo-terminals')
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  /** Airports a MAWB may arrive at (today: TLV). */
  importAirports(): Observable<AirportDto[]> {
    return this.importAirports$;
  }

  cargoTerminals(): Observable<CargoTerminalDto[]> {
    return this.cargoTerminals$;
  }

  /** The chargeable-weight rule for an airline prefix (or the default rule). */
  weightRule(airlinePrefix: string | null): Observable<WeightRuleDto> {
    let params = new HttpParams();
    if (airlinePrefix) params = params.set('airlinePrefix', airlinePrefix);
    return this.http.get<WeightRuleDto>('/api/air/weight-rule', { params });
  }

  statusHistory(
    entityType: StatusEntityType,
    entityId: number,
  ): Observable<StatusHistoryEntryDto[]> {
    return this.http.get<StatusHistoryEntryDto[]>('/api/status-history', {
      params: { entityType, entityId: String(entityId) },
    });
  }
}
