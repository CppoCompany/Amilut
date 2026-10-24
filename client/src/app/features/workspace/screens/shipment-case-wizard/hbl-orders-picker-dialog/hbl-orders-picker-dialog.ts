import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { Message } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { combineLatest, debounceTime, finalize, skip } from 'rxjs';

import type { CustomerDto, OrderDto, SupplierDto } from '../../../../../api/models';
import { ListOrdersParams, OrdersApi } from '../../../../../api/orders-api';
import { TypedRow } from '../../../../../shared/typed-row/typed-row';
import { TableSort } from '../../../../../shared/table-sort/table-sort';
import {
  CustomerAutocomplete,
  SEARCH_DEBOUNCE_MS,
} from '../../../../customers/customer-autocomplete/customer-autocomplete';
import { SupplierAutocomplete } from '../../../../suppliers/supplier-autocomplete/supplier-autocomplete';

/** Single batch fetched per filter change; rendering beyond this is not paginated. */
const MAX_ROWS = 200;

/**
 * "לשיוך להזמנה" popup of the File (HBL) form — a filter + checkbox grid over
 * the orders that have no File yet (`GET /orders?hasHbl=false`).
 *
 * Owns its own filters and fetching. Selection is local until the user
 * confirms: `confirmed` emits the chosen orders (full DTOs, so the caller can
 * show a summary without refetching), `cancelled` discards the changes.
 */
@Component({
  selector: 'app-hbl-orders-picker-dialog',
  imports: [
    FormsModule,
    Button,
    Checkbox,
    Dialog,
    Message,
    TableModule,
    CustomerAutocomplete,
    SupplierAutocomplete,
    TableSort,
    TypedRow,
  ],
  templateUrl: './hbl-orders-picker-dialog.html',
  styleUrl: './hbl-orders-picker-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HblOrdersPickerDialog {
  private readonly ordersApi = inject(OrdersApi);
  private readonly destroyRef = inject(DestroyRef);

  /** Orders already chosen on the form — pre-checked when the popup opens. */
  readonly initialSelection = input<readonly OrderDto[]>([]);

  readonly confirmed = output<OrderDto[]>();
  readonly cancelled = output<void>();

  /** Set once `confirmed` or `cancelled` went out — the dialog never emits twice. */
  private closed = false;

  protected readonly filterCustomer = signal<CustomerDto | null>(null);
  protected readonly filterSupplier = signal<SupplierDto | null>(null);

  private readonly candidates = signal<OrderDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Local working copy of the selection, keyed by order id; committed on "אישור". */
  private readonly selected = linkedSignal<ReadonlyMap<number, OrderDto>>(
    () => new Map(this.initialSelection().map((order) => [order.id, order])),
  );
  protected readonly selectedCount = computed(() => this.selected().size);

  /** Already-selected orders that the server excludes (they're on the File
   *  being edited, so `hasHbl: false` filters them out) are merged in so they
   *  stay visible and checked. */
  protected readonly rows = computed(() => {
    const base = this.candidates();
    const extra = [...this.selected().values()].filter(
      (order) => !base.some((candidate) => candidate.id === order.id),
    );
    return [...extra, ...base];
  });

  protected readonly allSelected = computed(() => {
    const visible = this.rows();
    return visible.length > 0 && visible.every((order) => this.selected().has(order.id));
  });

  constructor() {
    this.fetch();
    // `skip(1)` ignores the subscription's own initial emission — the first
    // fetch above runs immediately, without the debounce.
    combineLatest([toObservable(this.filterCustomer), toObservable(this.filterSupplier)])
      .pipe(skip(1), debounceTime(SEARCH_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.fetch());
  }

  protected isSelected(orderId: number): boolean {
    return this.selected().has(orderId);
  }

  protected toggle(order: OrderDto): void {
    const next = new Map(this.selected());
    if (next.has(order.id)) {
      next.delete(order.id);
    } else {
      next.set(order.id, order);
    }
    this.selected.set(next);
  }

  protected toggleAll(): void {
    if (this.allSelected()) {
      this.selected.set(new Map());
      return;
    }
    this.selected.set(new Map(this.rows().map((order) => [order.id, order])));
  }

  protected onConfirm(): void {
    this.closed = true;
    this.confirmed.emit([...this.selected().values()]);
  }

  protected onCancel(): void {
    // PrimeNG also fires onHide while the parent tears the dialog down after a confirm.
    if (this.closed) return;
    this.closed = true;
    this.cancelled.emit();
  }

  private fetch(): void {
    const params: ListOrdersParams = { limit: MAX_ROWS, hasHbl: false };
    const customer = this.filterCustomer();
    const supplier = this.filterSupplier();
    if (customer) params.customerId = customer.id;
    if (supplier) params.supplierId = supplier.id;

    this.loading.set(true);
    this.error.set(null);
    this.ordersApi
      .list(params)
      .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.candidates.set(rows),
        error: () => {
          this.candidates.set([]);
          this.error.set('טעינת ההזמנות נכשלה');
        },
      });
  }
}
