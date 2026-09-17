import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Observable,
  Subject,
  catchError,
  debounce,
  distinctUntilChanged,
  map,
  of,
  switchMap,
  timer,
} from 'rxjs';

import { CustomersApi } from '../../../api/customers-api';
import type { CustomerDto } from '../../../api/models';
import { AddCustomerDialog } from '../add-customer-dialog/add-customer-dialog';

/** The server rejects shorter queries, so we never send them. */
export const MIN_QUERY_LENGTH = 3;
export const SEARCH_DEBOUNCE_MS = 300;

interface SearchResult {
  readonly q: string;
  readonly list: CustomerDto[];
  readonly error: boolean;
}

let nextId = 0;

/**
 * Text input that searches customers by name (≥3 chars, debounced) and lets
 * the user pick one or add a new customer through a popup.
 *
 * Usage: `<app-customer-autocomplete [(customer)]="customer" />`.
 * `customer` is `null` while nothing valid is selected — it is reset to `null`
 * as soon as the text no longer matches the selected customer's name.
 */
@Component({
  selector: 'app-customer-autocomplete',
  imports: [AddCustomerDialog],
  templateUrl: './customer-autocomplete.html',
  styleUrl: './customer-autocomplete.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'autocomplete-wrapper',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class CustomerAutocomplete {
  private readonly api = inject(CustomersApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Two-way bound selected customer (`null` while nothing is chosen). */
  readonly customer = model<CustomerDto | null>(null);

  readonly placeholder = input('הקלד שם לקוח לחיפוש...');
  readonly disabled = input(false);
  /** Lets the parent flag the field as invalid (e.g. required customer missing on submit). */
  readonly invalid = input(false);
  /** `id` for the inner input so a parent `<label for>` can point at it. */
  readonly inputId = input(`customer-autocomplete-${nextId++}`);

  /** Emitted when a customer was created through the "add" popup (it is also set as `customer`). */
  readonly customerCreated = output<CustomerDto>();

  private readonly inputEl = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  /**
   * Text shown in the input. Follows the model: a selected customer puts its
   * name in the box; a programmatic reset to `null` clears the box, unless the
   * user is mid-edit (the text already differs from the previous selection).
   */
  protected readonly text = linkedSignal<CustomerDto | null, string>({
    source: this.customer,
    computation: (customer, previous) => {
      if (customer) return customer.name;
      const previousName = previous?.source?.name;
      const previousText = previous?.value ?? '';
      return previousName !== undefined && previousText !== previousName ? previousText : '';
    },
  });

  protected readonly results = signal<CustomerDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly open = signal(false);
  protected readonly error = signal(false);
  /** Query of the last completed search (drives the "not found" row text). */
  protected readonly lastQuery = signal('');
  /** Index into the option list (results, then the "add" row); `-1` = nothing active. */
  protected readonly activeIndex = signal(-1);
  protected readonly dialogOpen = signal(false);

  protected readonly listId = computed(() => `${this.inputId()}-list`);

  /** True when the last search completed with no matches, so the "add" row is offered. */
  protected readonly showAddRow = computed(
    () =>
      !this.loading() && !this.error() && this.lastQuery() !== '' && this.results().length === 0,
  );

  protected readonly optionCount = computed(
    () => this.results().length + (this.showAddRow() ? 1 : 0),
  );

  protected readonly addRowIndex = computed(() => (this.showAddRow() ? this.results().length : -1));

  protected readonly activeOptionId = computed(() => {
    const index = this.activeIndex();
    return this.open() && index >= 0 ? this.optionId(index) : null;
  });

  private readonly query$ = new Subject<string>();

  constructor() {
    this.query$
      .pipe(
        map((raw) => {
          const q = raw.trim();
          return q.length >= MIN_QUERY_LENGTH ? q : '';
        }),
        // Debounce real queries; let a "too short" reset through immediately so it
        // both cancels an in-flight request and re-arms distinctUntilChanged.
        debounce((q) => (q ? timer(SEARCH_DEBOUNCE_MS) : of(0))),
        distinctUntilChanged(),
        switchMap((q) => (q ? this.runSearch(q) : of(null))),
        takeUntilDestroyed(),
      )
      .subscribe((result) => this.applyResult(result));
  }

  // ---- Public helpers for the parent ------------------------------------

  /** Clear the text, the model and any results. */
  clear(): void {
    this.customer.set(null);
    this.text.set('');
    this.resetSearch();
  }

  focus(): void {
    this.inputEl().nativeElement.focus();
  }

  // ---- Input events --------------------------------------------------------

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.text.set(value);

    // Editing the text invalidates a previous selection.
    const selected = this.customer();
    if (selected && value !== selected.name) {
      this.customer.set(null);
    }

    if (value.trim().length < MIN_QUERY_LENGTH) {
      this.resetSearch();
    } else {
      this.error.set(false);
    }
    this.query$.next(value);
  }

  protected onFocus(): void {
    if (this.optionCount() > 0 || this.error()) {
      this.open.set(true);
    }
  }

  protected onBlur(): void {
    this.open.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        if (this.optionCount() > 0) {
          event.preventDefault();
          this.open.set(true);
          this.moveActive(1);
        }
        break;
      case 'ArrowUp':
        if (this.open() && this.optionCount() > 0) {
          event.preventDefault();
          this.moveActive(-1);
        }
        break;
      case 'Enter':
        if (this.open()) {
          event.preventDefault();
          this.activateIndex(this.activeIndex());
        }
        break;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.open.set(false);
        }
        break;
    }
  }

  /** Keep focus in the input when clicking inside the list (so blur does not close it first). */
  protected onListMousedown(event: MouseEvent): void {
    event.preventDefault();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  // ---- Options ---------------------------------------------------------------

  protected select(customer: CustomerDto): void {
    this.customer.set(customer);
    this.open.set(false);
    this.resetSearch();
    this.query$.next('');
  }

  protected openDialog(): void {
    this.open.set(false);
    this.dialogOpen.set(true);
  }

  protected onDialogSaved(customer: CustomerDto): void {
    this.dialogOpen.set(false);
    this.select(customer);
    this.customerCreated.emit(customer);
  }

  protected onDialogCancelled(): void {
    this.dialogOpen.set(false);
    this.focus();
  }

  protected setActive(index: number): void {
    this.activeIndex.set(index);
  }

  protected optionId(index: number): string {
    return `${this.listId()}-option-${index}`;
  }

  // ---- Internals ------------------------------------------------------------------

  private runSearch(q: string): Observable<SearchResult> {
    this.loading.set(true);
    this.error.set(false);
    return this.api.search(q).pipe(
      map((list) => ({ q, list, error: false })),
      catchError(() => of({ q, list: [], error: true })),
    );
  }

  private applyResult(result: SearchResult | null): void {
    this.loading.set(false);
    if (!result) return;

    this.results.set(result.list);
    this.error.set(result.error);
    this.lastQuery.set(result.q);
    this.activeIndex.set(result.list.length > 0 ? 0 : -1);
    this.open.set(true);
  }

  private resetSearch(): void {
    this.results.set([]);
    this.lastQuery.set('');
    this.error.set(false);
    this.loading.set(false);
    this.activeIndex.set(-1);
    this.open.set(false);
  }

  private moveActive(delta: number): void {
    const count = this.optionCount();
    if (count === 0) return;
    const current = this.activeIndex();
    const next = current < 0 ? (delta > 0 ? 0 : count - 1) : (current + delta + count) % count;
    this.activeIndex.set(next);
    this.scrollActiveIntoView(next);
  }

  private activateIndex(index: number): void {
    if (index < 0) return;
    const match = this.results()[index];
    if (match) {
      this.select(match);
    } else if (index === this.addRowIndex()) {
      this.openDialog();
    }
  }

  private scrollActiveIntoView(index: number): void {
    const el = this.host.nativeElement.querySelector<HTMLElement>(`#${this.optionId(index)}`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }
}
