import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { ORDER_STATUS_LABELS, ORDER_STATUSES, OrderStatus } from '../../../../api/enums';
import type { OrderDto } from '../../../../api/models';
import { ListOrdersParams, OrdersApi } from '../../../../api/orders-api';
import { NavigationService } from '../../navigation.service';

const PAGE_SIZE = 20;

/** "ההזמנות שלי" — paginated, filterable grid over all orders. */
@Component({
  selector: 'app-my-orders-screen',
  imports: [FormsModule],
  templateUrl: './my-orders.html',
  styleUrl: './my-orders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyOrdersScreen {
  private readonly ordersApi = inject(OrdersApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);

  // ── Filters (applied on demand, not live-as-you-type) ─────────────────────
  protected readonly filterHandlerUserId = signal('');
  protected readonly filterStatus = signal<OrderStatus | ''>('');
  protected readonly filterCreatedDate = signal('');
  protected readonly statuses = ORDER_STATUSES;
  protected readonly statusLabels = ORDER_STATUS_LABELS;

  // ── Grid state ──────────────────────────────────────────────────────────────
  protected readonly orders = signal<OrderDto[]>([]);
  protected readonly page = signal(0);
  protected readonly hasNextPage = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly pageSize = PAGE_SIZE;

  constructor() {
    this.fetch();
  }

  protected applyFilters(): void {
    this.page.set(0);
    this.fetch();
  }

  protected clearFilters(): void {
    this.filterHandlerUserId.set('');
    this.filterStatus.set('');
    this.filterCreatedDate.set('');
    this.page.set(0);
    this.fetch();
  }

  protected nextPage(): void {
    if (!this.hasNextPage() || this.loading()) return;
    this.page.update((p) => p + 1);
    this.fetch();
  }

  protected prevPage(): void {
    if (this.page() === 0 || this.loading()) return;
    this.page.update((p) => p - 1);
    this.fetch();
  }

  /** Double-click a row to edit that order in "יצירת הזמנה חדשה". */
  protected onEditOrder(order: OrderDto): void {
    this.nav.openOrderForEdit(order.id);
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  private fetch(): void {
    const params: ListOrdersParams = {
      limit: this.pageSize,
      offset: this.page() * this.pageSize,
    };

    const handlerIdText = this.filterHandlerUserId().trim();
    if (handlerIdText) {
      const handlerId = Number(handlerIdText);
      if (Number.isInteger(handlerId) && handlerId > 0) {
        params.handlerUserId = handlerId;
      }
    }
    if (this.filterStatus()) {
      params.status = this.filterStatus() as OrderStatus;
    }
    if (this.filterCreatedDate()) {
      params.createdDate = this.filterCreatedDate();
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.ordersApi
      .list(params)
      .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.orders.set(rows);
          this.hasNextPage.set(rows.length === this.pageSize);
        },
        error: () => {
          this.orders.set([]);
          this.hasNextPage.set(false);
          this.errorMessage.set('טעינת ההזמנות נכשלה');
        },
      });
  }
}
