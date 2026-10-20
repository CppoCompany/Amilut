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
import { formatHeRelativeTime } from '../../../shared/format';
import { ToastService } from '../../../shared/toast/toast.service';
import { NotificationsStateService } from '../notifications-state.service';

/**
 * Bell icon + unread badge + dropdown, mounted once in the workspace header
 * (`workspace.html`). The unread count is the shared
 * {@link NotificationsStateService} one (polled by the workspace shell), so
 * the bell, the sidebar badge and the dashboard widget always agree; the
 * full list is (re)fetched only when the dropdown is opened.
 */
@Component({
  selector: 'app-notification-bell',
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'bell-wrapper',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
    '(document:keydown.control.k)': 'open.set(false)',
    '(document:keydown.meta.k)': 'open.set(false)',
  },
})
export class NotificationBell {
  private readonly api = inject(NotificationsApi);
  private readonly state = inject(NotificationsStateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly unreadCount = this.state.unreadCount;
  protected readonly notifications = signal<NotificationDto[]>([]);
  protected readonly loading = signal(false);

  protected readonly relativeTime = formatHeRelativeTime;

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) {
      this.loadList();
      // Don't wait for the next poll — a notification that arrived since
      // (e.g. from a CCF the user just created) shows up right away.
      this.state.refresh();
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
          this.state.markedOneRead();
        },
        error: () => this.toast.error('סימון ההתראה כנקראה נכשל', { description: 'נסה שוב בעוד רגע.' }),
      });
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
