import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import type { NotificationDto } from '../../../api/models';
import { NotificationsApi } from '../../../api/notifications-api';

/**
 * Bell icon + unread badge + dropdown, mounted once in the workspace header
 * (`workspace.html`). No polling or websockets: the unread count is fetched
 * once when the app loads, and the full list is (re)fetched only when the
 * dropdown is opened.
 */
@Component({
  selector: 'app-notification-bell',
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'bell-wrapper',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class NotificationBell {
  private readonly api = inject(NotificationsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly unreadCount = signal(0);
  protected readonly notifications = signal<NotificationDto[]>([]);
  protected readonly loading = signal(false);

  constructor() {
    this.refreshUnreadCount();
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) {
      this.loadList();
      // The badge is otherwise only set once at app load (no polling) — also
      // refresh it on open so a notification that arrived since then (e.g.
      // from a CCF the user just created in this same session) shows up
      // without needing a full page reload.
      this.refreshUnreadCount();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  protected markRead(notification: NotificationDto): void {
    if (notification.isRead) {
      return;
    }
    this.api
      .markRead(notification.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.update((list) =>
            list.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
          );
          this.unreadCount.update((count) => Math.max(0, count - 1));
        },
      });
  }

  private refreshUnreadCount(): void {
    this.api
      .unreadCount()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: ({ count }) => this.unreadCount.set(count) });
  }

  private loadList(): void {
    this.loading.set(true);
    this.api
      .list()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({ next: (list) => this.notifications.set(list) });
  }
}
