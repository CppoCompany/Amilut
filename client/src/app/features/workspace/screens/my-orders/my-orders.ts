import { ScrollingModule } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { combineLatest, debounceTime, finalize, skip } from 'rxjs';

import { ORDER_STATUS_LABELS, ORDER_STATUSES, OrderStatus } from '../../../../api/enums';
import type { OrderDto } from '../../../../api/models';
import { ListOrdersParams, OrdersApi } from '../../../../api/orders-api';
import { ConfirmDialog } from '../../../../shared/confirm-dialog/confirm-dialog';
import { SEARCH_DEBOUNCE_MS } from '../../../customers/customer-autocomplete/customer-autocomplete';
import { NavigationService } from '../../navigation.service';

/** Single batch fetched per filter change; rendering beyond this is virtualized, not paginated. */
const MAX_ROWS = 200;

/** "ההזמנות שלי" — filterable grid over all orders, virtual-scrolled. */
@Component({
  selector: 'app-my-orders-screen',
  imports: [FormsModule, ScrollingModule, ConfirmDialog],
  templateUrl: './my-orders.html',
  styleUrl: './my-orders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyOrdersScreen {
  private readonly ordersApi = inject(OrdersApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);

  // ── Filters (live — debounced, no apply button) ────────────────────────────
  protected readonly filterHandlerName = signal('');
  protected readonly filterStatus = signal<OrderStatus | ''>('');
  protected readonly filterCreatedDate = signal('');
  protected readonly statuses = ORDER_STATUSES;
  protected readonly statusLabels = ORDER_STATUS_LABELS;

  // ── Grid state ──────────────────────────────────────────────────────────────
  protected readonly orders = signal<OrderDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  /** Order ids currently being deleted — disables their row's delete button mid-request. */
  protected readonly deletingIds = signal<ReadonlySet<number>>(new Set());
  /** The order awaiting delete confirmation in the modal, or `null`. */
  protected readonly pendingDelete = signal<OrderDto | null>(null);

  constructor() {
    this.fetch();

    combineLatest([
      toObservable(this.filterHandlerName),
      toObservable(this.filterStatus),
      toObservable(this.filterCreatedDate),
    ])
      .pipe(
        skip(1), // the initial load above already happened
        debounceTime(SEARCH_DEBOUNCE_MS),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.fetch());
  }

  protected clearFilters(): void {
    this.filterHandlerName.set('');
    this.filterStatus.set('');
    this.filterCreatedDate.set('');
  }

  /** Double-click a row to edit that order in "יצירת הזמנה חדשה". */
  protected onEditOrder(order: OrderDto): void {
    this.nav.openOrderForEdit(order.id);
  }

  protected isDeleting(orderId: number): boolean {
    return this.deletingIds().has(orderId);
  }

  /** Opens the confirm-delete modal for this row. */
  protected onDeleteOrder(order: OrderDto, event: Event): void {
    event.stopPropagation();
    if (this.isDeleting(order.id)) return;
    this.pendingDelete.set(order);
  }

  protected cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /** Confirmed via the modal — deletes the order and removes its row from the grid. */
  protected confirmDelete(): void {
    const order = this.pendingDelete();
    if (!order) return;
    this.pendingDelete.set(null);

    this.deletingIds.update((current) => new Set(current).add(order.id));
    this.ordersApi
      .remove(order.id)
      .pipe(
        finalize(() => {
          this.deletingIds.update((current) => {
            const next = new Set(current);
            next.delete(order.id);
            return next;
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.orders.update((rows) => rows.filter((row) => row.id !== order.id)),
        error: () => this.errorMessage.set('מחיקת ההזמנה נכשלה'),
      });
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  protected trackById(_index: number, order: OrderDto): number {
    return order.id;
  }

  private fetch(): void {
    const params: ListOrdersParams = { limit: MAX_ROWS };

    const handlerName = this.filterHandlerName().trim();
    if (handlerName) {
      params.handlerName = handlerName;
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
        next: (rows) => this.orders.set(rows),
        error: () => {
          this.orders.set([]);
          this.errorMessage.set('טעינת ההזמנות נכשלה');
        },
      });
  }
}
