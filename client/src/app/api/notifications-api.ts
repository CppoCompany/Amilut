import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { NotificationDto, UnreadCountDto } from './models';

/**
 * Thin HTTP client over the notifications REST resource (`/api/notifications`).
 * Shapes come from the generated OpenAPI schema (see `./models.ts`); the bearer
 * token is attached by the auth interceptor. Every route is scoped server-side
 * to the signed-in user.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/notifications';

  list(): Observable<NotificationDto[]> {
    return this.http.get<NotificationDto[]>(this.baseUrl);
  }

  unreadCount(): Observable<UnreadCountDto> {
    return this.http.get<UnreadCountDto>(`${this.baseUrl}/unread-count`);
  }

  /** Marks the user's notifications up to `upToId` read; returns what is still unread. */
  markAllRead(upToId: number): Observable<UnreadCountDto> {
    return this.http.patch<UnreadCountDto>(`${this.baseUrl}/read-all`, { upToId });
  }

  markRead(id: number): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/${id}/read`, {});
  }
}
