import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { DashboardApi } from '../../../../api/dashboard-api';
import {
  CCF_STATUS_LABELS,
  MBL_SHIPPING_TYPE_LABELS,
  MBL_STATUS_LABELS,
  MblStatus,
  ORDER_STATUS_LABELS,
} from '../../../../api/enums';
import type {
  DashboardCcfRowDto,
  DashboardResponseDto,
  NotificationDto,
} from '../../../../api/models';
import { NotificationsApi } from '../../../../api/notifications-api';
import { TableSkeleton } from '../../../../shared/table-skeleton/table-skeleton';
import { ToastService } from '../../../../shared/toast/toast.service';
import { isTreeChildGroup, TreeChild } from '../../navigation.model';
import { NavigationService } from '../../navigation.service';
import { NotificationsStateService } from '../../notifications-state.service';

/** Sidebar row ids of the "view all" list pages each card links to (owned by the lists feature). */
export const DASHBOARD_LIST_ROW_IDS = {
  myOrders: 'ws-list-my-orders',
  casesInRelease: 'ws-list-cases-in-release',
  ccfsPendingClassification: 'ws-list-my-classifications',
  ccfs: 'ws-list-my-cases',
  importProcesses: 'ws-list-import-processes',
} as const;

/** Sidebar row ids of the "actions" at the top of the dashboard. */
export const DASHBOARD_ACTION_ROW_IDS = {
  /** "יצירת הזמנה חדשה" */
  newOrder: 'ws-order',
  /** "יצירת תיק שילוח" — the MBL/HBL wizard is the import process. */
  newImportProcess: 'ws-shipment',
  /** "תיק עמילות" — the Customs Clearance File screen opens as a fresh draft. */
  newCcf: 'ws-ccf',
} as const;

/** "איזור האישי" — landing screen: quick actions, the "הודעות" widget and five compact "latest 5" cards. */
@Component({
  selector: 'app-dashboard-screen',
  imports: [TableSkeleton],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardScreen {
  private readonly dashboardApi = inject(DashboardApi);
  private readonly nav = inject(NavigationService);
  private readonly notificationsApi = inject(NotificationsApi);
  private readonly notificationsState = inject(NotificationsStateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** "יום שלישי, 20 באוקטובר 2026" — the dashboard is a snapshot of now. */
  protected readonly today = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  protected readonly data = signal<DashboardResponseDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  // ── "הודעות" widget ─────────────────────────────────────────────────────────
  /** The user's notifications as fetched — `isRead` is kept as it was at
   *  fetch time, so the ones that were new on this visit stay highlighted
   *  even though opening the dashboard marks them read. */
  protected readonly messages = signal<NotificationDto[]>([]);
  protected readonly messagesLoading = signal(false);
  protected readonly messagesError = signal<string | null>(null);
  /** How many were unread when fetched — the "N חדשות" chip in the card header. */
  protected readonly newMessageCount = computed(() => this.messages().filter((m) => !m.isRead).length);

  protected readonly orderStatusLabels = ORDER_STATUS_LABELS;
  protected readonly shippingTypeLabels = MBL_SHIPPING_TYPE_LABELS;
  protected readonly ccfStatusLabels = CCF_STATUS_LABELS;
  protected readonly listRows = DASHBOARD_LIST_ROW_IDS;

  constructor() {
    this.load();
    this.loadMessages();

    // Viewing the dashboard is what clears the badge, so a notification the
    // poll picks up while the user is already here is shown (and marked
    // read) right away instead of leaving the badge lit.
    effect(() => {
      if (this.notificationsState.unreadCount() === 0) return;
      untracked(() => {
        if (!this.messagesLoading()) this.loadMessages();
      });
    });
  }

  protected reload(): void {
    if (this.loading()) return;
    this.load();
  }

  protected reloadMessages(): void {
    if (this.messagesLoading()) return;
    this.loadMessages();
  }

  /** "תיק עמילות חדש" → the existing "תיק עמילות" screen (fresh draft). */
  protected newCcf(): void {
    this.selectRow(DASHBOARD_ACTION_ROW_IDS.newCcf);
  }

  /** A message about a CCF opens that CCF; other messages are not clickable. */
  protected openMessage(message: NotificationDto): void {
    if (message.relatedCcfId !== null) this.openCcf(message.relatedCcfId);
  }

  /** "הזמנה חדשה" → the existing "יצירת הזמנה חדשה" screen (fresh draft). */
  protected newOrder(): void {
    this.selectRow(DASHBOARD_ACTION_ROW_IDS.newOrder);
  }

  /** "תהליך יבוא חדש" → the existing "יצירת תיק שילוח" wizard (fresh draft). */
  protected newImportProcess(): void {
    this.selectRow(DASHBOARD_ACTION_ROW_IDS.newImportProcess);
  }

  /**
   * "צפה בהכל" → the matching full list page. The list rows are added to the
   * sidebar by the lists feature; if a row is not in the tree (yet), this is
   * a no-op rather than an error.
   */
  protected openList(rowId: string): void {
    this.selectRow(rowId);
  }

  /** "ההזמנות שלי" row → that order, loaded for editing. */
  protected openOrder(orderId: number): void {
    this.nav.openOrderForEdit(orderId);
  }

  /** "תיקי עמילות שלא עברו סיווג" row → the classification screen, scoped to that CCF. */
  protected openCcfClassification(ccfId: number): void {
    this.nav.openClassificationFor({ kind: 'ccf', id: ccfId });
  }

  /** "תיקי עמילות" row → the CCF screen with that file loaded. */
  protected openCcf(ccfId: number): void {
    this.nav.openCcfForView(ccfId);
  }

  /** "תהליכי יבוא" row → the shipping-case wizard, loaded for editing. */
  protected openImportProcess(caseId: number): void {
    this.nav.openCaseForEdit(caseId);
  }

  /** "1/4" — classified lines out of the CCF's supplier-invoice lines; "—" before any were filed. */
  protected classificationProgress(ccf: DashboardCcfRowDto): string {
    return ccf.lineCount === 0 ? '—' : `${ccf.classifiedLineCount}/${ccf.lineCount}`;
  }

  protected mblStatusLabel(status: MblStatus): string {
    return MBL_STATUS_LABELS[status] ?? status;
  }

  protected joinOrEmDash(values: readonly string[]): string {
    return values.length ? values.join(', ') : '—';
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  protected formatDateTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Selects the sidebar leaf with this id, if the tree has one. */
  private selectRow(rowId: string): boolean {
    const row = this.findRow(rowId);
    if (!row) return false;
    this.nav.selectChild(row);
    return true;
  }

  private findRow(rowId: string): TreeChild | null {
    for (const entry of this.nav.tree()) {
      if (isTreeChildGroup(entry)) {
        const child = entry.children.find((c) => c.id === rowId);
        if (child) return child;
      } else if (entry.id === rowId) {
        return entry;
      }
    }
    return null;
  }

  private load(): void {
    const recovering = this.errorMessage() !== null;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.dashboardApi
      .get()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.data.set(response);
          if (recovering) this.toast.success('לוח הבקרה עודכן');
        },
        error: () => {
          this.data.set(null);
          this.errorMessage.set('טעינת לוח הבקרה נכשלה');
        },
      });
  }

  /**
   * Fetches the "הודעות" list, then marks what it shows as read — up to the
   * newest id fetched, so one that arrives in between stays unread and keeps
   * the badge (and the effect above) honest.
   */
  private loadMessages(): void {
    const recovering = this.messagesError() !== null;
    this.messagesLoading.set(true);
    this.messagesError.set(null);
    this.notificationsApi
      .list()
      .pipe(
        finalize(() => this.messagesLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (messages) => {
          this.messages.set(messages);
          if (recovering) this.toast.success('ההודעות עודכנו');
          if (!messages.some((m) => !m.isRead)) return;
          const upToId = Math.max(...messages.map((m) => m.id));
          this.notificationsState
            .markAllRead(upToId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ error: () => undefined });
        },
        error: () => {
          this.messages.set([]);
          this.messagesError.set('טעינת ההודעות נכשלה');
        },
      });
  }
}
