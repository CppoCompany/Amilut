import {
  ChangeDetectionStrategy,
  Component,
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
import { FormsModule } from '@angular/forms';
import { AutoComplete } from 'primeng/autocomplete';
import { Button } from 'primeng/button';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';

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
 * Searches customers by name on PrimeNG's autocomplete (≥3 chars, debounced
 * by the widget) and lets the user pick one or add a new customer through a
 * popup offered when nothing matches.
 *
 * Usage: `<app-customer-autocomplete [(customer)]="customer" />`.
 * `customer` is `null` while nothing valid is selected — it is reset to `null`
 * as soon as the text no longer matches the selected customer's name.
 */
@Component({
  selector: 'app-customer-autocomplete',
  imports: [FormsModule, AutoComplete, Button, AddCustomerDialog],
  templateUrl: './customer-autocomplete.html',
  styleUrl: './customer-autocomplete.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerAutocomplete {
  private readonly api = inject(CustomersApi);

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

  private readonly autocomplete = viewChild.required(AutoComplete);

  protected readonly minQueryLength = MIN_QUERY_LENGTH;
  protected readonly debounceMs = SEARCH_DEBOUNCE_MS;

  /**
   * Text shown in the input. Follows the model: a selected customer puts its
   * name in the box; a programmatic reset to `null` clears the box, unless the
   * user is mid-edit (the text already differs from the previous selection).
   */
  readonly text = linkedSignal<CustomerDto | null, string>({
    source: this.customer,
    computation: (customer, previous) => {
      if (customer) return customer.name;
      const previousName = previous?.source?.name;
      const previousText = previous?.value ?? '';
      return previousName !== undefined && previousText !== previousName ? previousText : '';
    },
  });

  readonly results = signal<CustomerDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  /** Query of the last completed search (drives the "not found" row text). */
  readonly lastQuery = signal('');
  readonly dialogOpen = signal(false);

  /** True when the last search completed with no matches, so the "add" row is offered. */
  readonly showAddRow = computed(
    () =>
      !this.loading() && !this.error() && this.lastQuery() !== '' && this.results().length === 0,
  );

  /** What the widget holds: the selected customer, or the free text being typed. */
  protected readonly value = computed<CustomerDto | string>(() => this.customer() ?? this.text());

  private readonly query$ = new Subject<string>();

  constructor() {
    this.query$
      .pipe(
        map((raw) => {
          const q = raw.trim();
          return q.length >= MIN_QUERY_LENGTH ? q : '';
        }),
        // A "too short" query cancels whatever request is still in flight.
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
    this.autocomplete().inputEL?.nativeElement.focus();
  }

  // ---- Widget events ----------------------------------------------------------

  /** PrimeNG asks for suggestions (already debounced and ≥ the minimum length). */
  search(query: string): void {
    this.query$.next(query);
  }

  /** The widget's value changed: a picked customer, or typed text. */
  onValueChange(value: CustomerDto | string | null): void {
    if (value !== null && typeof value === 'object') {
      this.select(value);
      return;
    }
    const text = value ?? '';
    this.text.set(text);

    // Editing the text invalidates a previous selection.
    const selected = this.customer();
    if (selected && text !== selected.name) {
      this.customer.set(null);
    }

    if (text.trim().length < MIN_QUERY_LENGTH) {
      this.resetSearch();
      this.query$.next('');
    }
  }

  select(customer: CustomerDto): void {
    this.customer.set(customer);
    this.resetSearch();
    this.query$.next('');
  }

  openDialog(): void {
    this.autocomplete().hide();
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
  }

  private resetSearch(): void {
    this.results.set([]);
    this.lastQuery.set('');
    this.error.set(false);
    this.loading.set(false);
  }
}
