import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { combineLatest, debounceTime, finalize, skip } from 'rxjs';

import { ORDER_STATUS_LABELS, ORDER_STATUSES, OrderStatus } from '../../../../api/enums';
import type { OrderDto } from '../../../../api/models';
import { ListOrdersParams, OrdersApi } from '../../../../api/orders-api';
import { itemOpenGuard } from '../../../../core/guards/item-open.guard';
import { SEARCH_DEBOUNCE_MS } from '../../../customers/customer-autocomplete/customer-autocomplete';
import { NavigationService } from '../../navigation.service';

/** Single batch fetched per filter change; rendering beyond this is virtualized, not paginated. */
const MAX_ROWS = 200;

/** "ההזמנות שלי" — filterable grid over all orders, virtual-scrolled. */
@Component({
  selector: 'app-my-orders-screen',
  imports: [FormsModule, ScrollingModule],
  templateUrl: './my-orders.html',
  styleUrl: './my-orders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyOrdersScreen {
  private readonly ordersApi = inject(OrdersApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);
  private readonly injector = inject(Injector);

  // ── Filters (live — debounced, no apply button) ────────────────────────────
  protected readonly filterHandlerUserId = signal('');
  protected readonly filterStatus = signal<OrderStatus | ''>('');
  protected readonly filterCreatedDate = signal('');
  protected readonly statuses = ORDER_STATUSES;
  protected readonly statusLabels = ORDER_STATUS_LABELS;

  // ── Grid state ──────────────────────────────────────────────────────────────
  protected readonly orders = signal<OrderDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.fetch();

    combineLatest([
      toObservable(this.filterHandlerUserId),
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
    this.filterHandlerUserId.set('');
    this.filterStatus.set('');
    this.filterCreatedDate.set('');
  }

  /** Double-click a row to edit that order in "יצירת הזמנה חדשה". */
  protected async onEditOrder(order: OrderDto): Promise<void> {
    const allowed = await runInInjectionContext(this.injector, () =>
      itemOpenGuard({ type: 'order', id: String(order.id), label: `הזמנה #${order.id}` }),
    );
    if (allowed) this.nav.openOrderForEdit(order.id);
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
        next: (rows) => this.orders.set(rows),
        error: () => {
          this.orders.set([]);
          this.errorMessage.set('טעינת ההזמנות נכשלה');
        },
      });
  }
}
