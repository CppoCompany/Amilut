import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterRenderEffect,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Table, TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { finalize } from 'rxjs';

import { CcfApi } from '../../../api/ccf-api';
import { CCF_STATUS_LABELS, ORDER_STATUS_LABELS } from '../../../api/enums';
import type { FilingContext } from '../../../api/filing-context.model';
import type { CcfDto, OrderDto } from '../../../api/models';
import { OrdersApi } from '../../../api/orders-api';
import { formatHeDate } from '../../../shared/format';
import { StatusTag } from '../../../shared/status-tag/status-tag';
import { SortAccessors, TableSort } from '../../../shared/table-sort/table-sort';
import { TypedRow } from '../../../shared/typed-row/typed-row';
import { FilingContextService } from '../filing-context.service';

/** The server's page-size ceiling — one batch per list, filtered/sorted in memory. */
const MAX_ITEMS = 200;

type RecordKind = FilingContext['kind'];

/**
 * "הזמנות / תיקי עמילות" tabs on the Filing screen: one PrimeNG table per
 * kind. Clicking a row writes it straight to {@link FilingContextService} —
 * the screen's import-files panel reacts to that signal — and the matching
 * row carries the shared `.data-table__row--selected` highlight. Replaces the
 * select-button + dropdown `FilingContextPicker`.
 */
@Component({
  selector: 'app-filing-records',
  imports: [
    IconField,
    InputIcon,
    InputText,
    Message,
    TableModule,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    StatusTag,
    TableSort,
    TypedRow,
  ],
  templateUrl: './filing-records.html',
  styleUrl: './filing-records.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilingRecords {
  private readonly ordersApi = inject(OrdersApi);
  private readonly ccfApi = inject(CcfApi);
  private readonly filingContext = inject(FilingContextService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ordersTable = viewChild<Table>('ordersTable');
  private readonly ccfsTable = viewChild<Table>('ccfsTable');
  /** Set by a row click: that row is on screen already, so no scroll to it. */
  private skipNextScroll = false;

  protected readonly context = this.filingContext.context;
  /** The active tab — its own signal, not derived from `context`: clearing
   *  the selection on a tab switch must not snap it back to "order". */
  protected readonly kind = signal<RecordKind>('order');

  protected readonly orders = signal<OrderDto[]>([]);
  protected readonly ccfs = signal<CcfDto[]>([]);
  protected readonly loadingOrders = signal(false);
  protected readonly loadingCcfs = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly orderStatusLabels = ORDER_STATUS_LABELS;
  protected readonly ccfStatusLabels = CCF_STATUS_LABELS;
  protected readonly formatDate = formatHeDate;
  /** "סטטוס" sorts by its Hebrew label, as shown (`appTableSort`). */
  protected readonly orderSort: SortAccessors<OrderDto> = {
    status: (order) => ORDER_STATUS_LABELS[order.status],
  };
  protected readonly ccfSort: SortAccessors<CcfDto> = {
    status: (ccf) => CCF_STATUS_LABELS[ccf.status],
    billNumber: (ccf) => this.billNumber(ccf),
  };
  protected readonly trackById = (_: number, row: { id: number }): number => row.id;

  constructor() {
    this.loadOrders();
    this.loadCcfs();

    // A context that arrives from outside (the nav hand-off from the Order /
    // CCF screens or "ההזמנות שלי") opens its tab.
    effect(() => {
      const context = this.context();
      if (context !== null) {
        untracked(() => this.kind.set(context.kind));
      }
    });

    // Bring the highlighted row into view — on arrival from another screen
    // it may sit below the fold, and with virtual scrolling it is not even
    // rendered yet, so scroll the table's scroller to its index (in the
    // table's filtered + sorted order, as shown).
    afterRenderEffect(() => {
      const context = this.context();
      this.orders();
      this.ccfs();
      untracked(() => {
        if (this.skipNextScroll) {
          this.skipNextScroll = false;
          return;
        }
        if (context === null) return;
        const table = context.kind === 'order' ? this.ordersTable() : this.ccfsTable();
        const shown = (table?.filteredValue ?? table?.value ?? []) as { id: number }[];
        const index = shown.findIndex((row) => row.id === context.id);
        if (table && index >= 0) table.scrollToVirtualIndex(index);
      });
    });
  }

  protected onKindChange(value: string | number | undefined): void {
    const nextKind: RecordKind = value === 'ccf' ? 'ccf' : 'order';
    if (nextKind === this.kind()) return;
    this.kind.set(nextKind);
    // An order id and a ccf id are different spaces — nothing to carry over.
    this.context.set(null);
  }

  protected select(kind: RecordKind, id: number): void {
    if (this.isSelected(kind, id)) return;
    this.skipNextScroll = true;
    this.context.set({ kind, id });
  }

  protected isSelected(kind: RecordKind, id: number): boolean {
    const context = this.context();
    return context?.kind === kind && context.id === id;
  }

  /** The CCF's bill: its sea MBL, or its air HAWB. */
  protected billNumber(ccf: CcfDto): string | null {
    return ccf.shipmentFileMblNumber ?? ccf.hblNumber;
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
