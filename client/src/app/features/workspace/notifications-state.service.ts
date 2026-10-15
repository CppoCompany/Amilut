import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, catchError, interval, map, switchMap, tap } from 'rxjs';

import { NotificationsApi } from '../../api/notifications-api';

/** How often the unread count is re-checked while the workspace is open. */
export const NOTIFICATIONS_POLL_MS = 30_000;

/**
 * App-wide unread-notification count, shared by the header bell, the
 * sidebar's "איזור האישי" badge and the dashboard's "הודעות" widget so all
 * three always agree. No websockets: the count is fetched when the
 * workspace opens and re-checked every {@link NOTIFICATIONS_POLL_MS}.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsStateService {
  private readonly api = inject(NotificationsApi);

  readonly unreadCount = signal(0);

  /** Fetches the count now, then every {@link NOTIFICATIONS_POLL_MS} until `destroyRef` is destroyed. */
  startPolling(destroyRef: DestroyRef): void {
    this.refresh();
    interval(NOTIFICATIONS_POLL_MS)
      .pipe(
        switchMap(() => this.fetchCount()),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe();
  }

  /** Re-checks the count once (e.g. when the bell opens). */
  refresh(): void {
    this.fetchCount().subscribe();
  }

  /** One notification was marked read (the bell does that per row). */
  markedOneRead(): void {
    this.unreadCount.update((count) => Math.max(0, count - 1));
  }

  /**
   * Marks everything up to `upToId` read — what the dashboard does once its
   * widget has shown the list — and takes the server's remaining count
   * (anything that arrived after `upToId` stays unread).
   */
  markAllRead(upToId: number): Observable<void> {
    return this.api.markAllRead(upToId).pipe(
      tap(({ count }) => this.unreadCount.set(count)),
      map(() => undefined),
    );
  }

  /** A failed check keeps the last known count rather than breaking the poll. */
  private fetchCount(): Observable<number> {
    return this.api.unreadCount().pipe(
      map(({ count }) => count),
      tap((count) => this.unreadCount.set(count)),
      catchError(() => EMPTY),
    );
  }
}
