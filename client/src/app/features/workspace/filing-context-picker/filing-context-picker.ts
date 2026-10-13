import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { CcfApi } from '../../../api/ccf-api';
import type { CcfDto, OrderDto } from '../../../api/models';
import { OrdersApi } from '../../../api/orders-api';
import { FilingContextService } from '../filing-context.service';

/** The server's page-size ceiling — same batch size the retired `CasePicker` used. */
const MAX_ITEMS = 200;

type PickerKind = 'order' | 'ccf';

/**
 * "הזמנה / תיק עמילות" dropdown at the top of the per-context screens
 * (filing, classification). A 2-way toggle picks which list is offered;
 * the choice writes straight to {@link FilingContextService} — the hosting
 * screen reacts to that signal. Replaces the MBL-only `CasePicker`.
 */
@Component({
  selector: 'app-filing-context-picker',
  templateUrl: './filing-context-picker.html',
  styleUrl: './filing-context-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilingContextPicker {
  private readonly ordersApi = inject(OrdersApi);
  private readonly ccfApi = inject(CcfApi);
  private readonly filingContext = inject(FilingContextService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly context = this.filingContext.context;
  /** Which list the toggle shows — its own signal, not derived from `context`:
   *  clearing the selection (e.g. on toggle) must not snap this back to
   *  "order" just because `context()` is briefly `null`. Defaults to "order". */
  protected readonly kind = signal<PickerKind>('order');

  protected readonly orders = signal<OrderDto[]>([]);
  protected readonly ccfs = signal<CcfDto[]>([]);
  protected readonly loadingOrders = signal(false);
  protected readonly loadingCcfs = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.loadOrders();
    this.loadCcfs();

    // Keep the toggle in sync when a context arrives from outside the picker
    // itself (a nav hand-off sets `context` directly, bypassing the toggle).
    effect(() => {
      const context = this.context();
      if (context !== null) {
        untracked(() => this.kind.set(context.kind));
      }
    });
  }

  protected onKindChange(nextKind: PickerKind): void {
    if (nextKind === this.kind()) return;
    this.kind.set(nextKind);
    // An order id and a ccf id are different spaces — nothing to carry over.
    this.context.set(null);
  }

  protected onOrderChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.context.set(value === '' ? null : { kind: 'order', id: Number(value) });
  }

  protected onCcfChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.context.set(value === '' ? null : { kind: 'ccf', id: Number(value) });
  }

  /** "הזמנה 1024 · ACME Ltd." */
  protected orderLabel(order: OrderDto): string {
    return [`הזמנה ${order.id}`, order.customerName].filter((part) => !!part).join(' · ');
  }

  /** "תיק עמילות 7 · CCF1007" */
  protected ccfLabel(ccf: CcfDto): string {
    return [`תיק עמילות ${ccf.id}`, ccf.fileNumber].filter((part) => !!part).join(' · ');
  }

  private loadOrders(): void {
    this.loadingOrders.set(true);
    this.ordersApi
      .list({ limit: MAX_ITEMS })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingOrders.set(false)),
      )
      .subscribe({
        next: (orders) => {
          this.orders.set(orders);
          const current = this.context();
          if (current?.kind === 'order' && !orders.some((o) => o.id === current.id)) {
            this.context.set(null);
          }
        },
        error: () => this.errorMessage.set('טעינת רשימת ההזמנות נכשלה'),
      });
  }

  private loadCcfs(): void {
    this.loadingCcfs.set(true);
    this.ccfApi
      .list({ limit: MAX_ITEMS })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingCcfs.set(false)),
      )
      .subscribe({
        next: (ccfs) => {
          this.ccfs.set(ccfs);
          const current = this.context();
          if (current?.kind === 'ccf' && !ccfs.some((c) => c.id === current.id)) {
            this.context.set(null);
          }
        },
        error: () => this.errorMessage.set('טעינת רשימת תיקי העמילות נכשלה'),
      });
  }
}
