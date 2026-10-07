import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Subject, catchError, combineLatest, debounceTime, map, of, skip, switchMap } from 'rxjs';

import type { CustomerDto } from '../../../../../api/models';
import { LIST_PAGE_SIZE, type SortDir } from '../../../../../api/paging';
import { DataGrid, GridSort } from '../../../../../shared/data-grid/data-grid';
import { ListFilterBar } from '../../../../../shared/list-filter-bar/list-filter-bar';
import { SEARCH_DEBOUNCE_MS } from '../../../../customers/customer-autocomplete/customer-autocomplete';
import { ListLoadParams, ListPageConfig } from '../list-page.model';
import { EMPTY_LIST_FILTERS, ListStateService } from '../list-state.service';

/** Outcome of one fetch, so a failed page never breaks the reload stream. */
type LoadOutcome<T> = { ok: true; items: T[]; total: number } | { ok: false };

/**
 * The one screen behind every "רשימות" page: title + {@link ListFilterBar} +
 * {@link DataGrid}, driven by a {@link ListPageConfig}. Filters are live and
 * debounced (no apply button, like the existing grids) and reset the page to
 * 1; sort/page changes re-fetch immediately. Everything is persisted in
 * {@link ListStateService} so the page comes back as the user left it.
 * Overlapping requests are resolved with `switchMap` — only the latest wins.
 */
@Component({
  selector: 'app-list-page',
  imports: [ListFilterBar, DataGrid],
  templateUrl: './list-page.html',
  styleUrl: './list-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListPage<T> implements OnInit {
  readonly config = input.required<ListPageConfig<T>>();

  private readonly listState = inject(ListStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  // ── Filters (two-way bound to the filter bar) ──────────────────────────────
  protected readonly q = signal('');
  protected readonly status = signal('');
  protected readonly customer = signal<CustomerDto | null>(null);
  protected readonly caseNumber = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');

  // ── Sort / page ────────────────────────────────────────────────────────────
  protected readonly sort = signal('');
  protected readonly dir = signal<SortDir>('desc');
  protected readonly page = signal(1);
  protected readonly pageSize = LIST_PAGE_SIZE;

  // ── Grid state ─────────────────────────────────────────────────────────────
  protected readonly rows = signal<T[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly statusOptions = computed(() => this.config().statusOptions ?? null);

  private readonly reload$ = new Subject<void>();

  ngOnInit(): void {
    const config = this.config();
    const saved = this.listState.get(config.page, config.defaultSort, config.defaultDir ?? 'desc');
    this.q.set(saved.q);
    this.status.set(saved.status);
    this.customer.set(saved.customer);
    this.caseNumber.set(saved.caseNumber);
    this.from.set(saved.from);
    this.to.set(saved.to);
    this.sort.set(saved.sort);
    this.dir.set(saved.dir);
    this.page.set(saved.page);

    this.reload$
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.error.set(null);
          this.persist();
          return config.load(this.buildParams()).pipe(
            map((result): LoadOutcome<T> => ({ ok: true, items: result.items, total: result.total })),
            catchError(() => of<LoadOutcome<T>>({ ok: false })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((outcome) => {
        this.loading.set(false);
        if (outcome.ok) {
          this.rows.set(outcome.items);
          this.total.set(outcome.total);
        } else {
          this.rows.set([]);
          this.total.set(0);
          this.error.set(config.errorText ?? 'טעינת הנתונים נכשלה');
        }
      });

    this.reload$.next();

    const options = { injector: this.injector };
    combineLatest([
      toObservable(this.q, options),
      toObservable(this.status, options),
      toObservable(this.customer, options),
      toObservable(this.caseNumber, options),
      toObservable(this.from, options),
      toObservable(this.to, options),
    ])
      .pipe(
        skip(1), // the initial load above already happened
        debounceTime(SEARCH_DEBOUNCE_MS),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.page.set(1);
        this.reload$.next();
      });
  }

  protected clearFilters(): void {
    this.q.set(EMPTY_LIST_FILTERS.q);
    this.status.set(EMPTY_LIST_FILTERS.status);
    this.customer.set(EMPTY_LIST_FILTERS.customer);
    this.caseNumber.set(EMPTY_LIST_FILTERS.caseNumber);
    this.from.set(EMPTY_LIST_FILTERS.from);
    this.to.set(EMPTY_LIST_FILTERS.to);
  }

  protected onSortChange(change: GridSort): void {
    this.sort.set(change.sort);
    this.dir.set(change.dir);
    this.page.set(1);
    this.reload$.next();
  }

  protected onPageChange(page: number): void {
    this.page.set(page);
    this.reload$.next();
  }

  protected onOpen(row: T): void {
    this.config().open?.(row);
  }

  private buildParams(): ListLoadParams {
    const q = this.q().trim();
    const caseNumberText = this.caseNumber().trim();
    const caseNumber = Number(caseNumberText);
    return {
      q: q || undefined,
      status: this.status() || undefined,
      customerId: this.customer()?.id,
      caseNumber: caseNumberText && Number.isInteger(caseNumber) && caseNumber > 0 ? caseNumber : undefined,
      from: this.from() || undefined,
      to: this.to() || undefined,
      sort: this.sort(),
      dir: this.dir(),
      page: this.page(),
      pageSize: this.pageSize,
    };
  }

  private persist(): void {
    this.listState.set(this.config().page, {
      q: this.q(),
      status: this.status(),
      customer: this.customer(),
      caseNumber: this.caseNumber(),
      from: this.from(),
      to: this.to(),
      sort: this.sort(),
      dir: this.dir(),
      page: this.page(),
    });
  }
}
