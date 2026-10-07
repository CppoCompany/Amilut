import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { DashboardApi } from '../../../../api/dashboard-api';
import { MBL_SHIPPING_TYPE_LABELS, ORDER_STATUS_LABELS } from '../../../../api/enums';
import type { DashboardResponseDto } from '../../../../api/models';
import { isTreeChildGroup, TreeChild } from '../../navigation.model';
import { NavigationService } from '../../navigation.service';

/**
 * Hebrew labels for `mbl.status`.
 * TODO(merge): replace with `MBL_STATUS_LABELS`/`mblStatusLabels` from
 * `api/enums.ts` once the `MblStatus` enum lands on the lists branch.
 */
export const MBL_STATUS_LABELS: Record<string, string> = {
  open: 'פתוח',
  in_release: 'בהתרה',
  released: 'שוחרר',
  closed: 'סגור',
};

/** Sidebar row ids of the "view all" list pages each card links to (owned by the lists feature). */
export const DASHBOARD_LIST_ROW_IDS = {
  myOrders: 'ws-list-my-orders',
  casesInRelease: 'ws-list-cases-in-release',
  myClassifications: 'ws-list-my-classifications',
  myCases: 'ws-list-my-cases',
  importProcesses: 'ws-list-import-processes',
} as const;

/** Sidebar row ids of the two "actions" at the top of the dashboard. */
export const DASHBOARD_ACTION_ROW_IDS = {
  /** "יצירת הזמנה חדשה" */
  newOrder: 'ws-order',
  /** "יצירת תיק שילוח" — the MBL/HBL wizard is the import process. */
  newImportProcess: 'ws-shipment',
} as const;

/** "לוח בקרה" — landing screen: quick actions plus five compact "latest 5" cards. */
@Component({
  selector: 'app-dashboard-screen',
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardScreen {
  private readonly dashboardApi = inject(DashboardApi);
  private readonly nav = inject(NavigationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = signal<DashboardResponseDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly orderStatusLabels = ORDER_STATUS_LABELS;
  protected readonly shippingTypeLabels = MBL_SHIPPING_TYPE_LABELS;
  protected readonly listRows = DASHBOARD_LIST_ROW_IDS;

  constructor() {
    this.load();
  }

  protected reload(): void {
    if (this.loading()) return;
    this.load();
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

  protected mblStatusLabel(status: string): string {
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
    this.loading.set(true);
    this.errorMessage.set(null);
    this.dashboardApi
      .get()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => this.data.set(response),
        error: () => {
          this.data.set(null);
          this.errorMessage.set('טעינת לוח הבקרה נכשלה');
        },
      });
  }
}
