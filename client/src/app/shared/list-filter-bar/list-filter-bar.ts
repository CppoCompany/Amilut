import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CustomerDto } from '../../api/models';
import { CustomerAutocomplete } from '../../features/customers/customer-autocomplete/customer-autocomplete';

/** One `<option>` of the status select. */
export interface FilterOption {
  value: string;
  label: string;
}

let nextId = 0;

/**
 * The filter bar above a "רשימות" grid: free-text "חיפוש", an optional status
 * select, an optional customer autocomplete, an optional "מספר תיק" box, a
 * date range ("מתאריך" / "עד תאריך") and "נקה". Every value is a two-way
 * `model`, so the parent owns the state (and its debounce/fetch); this
 * component only renders the inputs with the shared `.filter-bar` styles.
 */
@Component({
  selector: 'app-list-filter-bar',
  imports: [FormsModule, CustomerAutocomplete],
  templateUrl: './list-filter-bar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListFilterBar {
  readonly q = model('');
  readonly status = model('');
  readonly customer = model<CustomerDto | null>(null);
  readonly caseNumber = model('');
  readonly from = model('');
  readonly to = model('');

  /** Options of the status select; `null` hides the select. */
  readonly statusOptions = input<readonly FilterOption[] | null>(null);
  readonly showCustomer = input(false);
  readonly showCaseNumber = input(false);
  readonly searchPlaceholder = input('חיפוש...');
  readonly disabled = input(false);

  /** "נקה" was clicked — the parent resets the models (and whatever else it keeps). */
  readonly clear = output<void>();

  /** Unique id prefix so several bars (or the grids' own inputs) never share `for`/`id`. */
  protected readonly uid = `list-filter-${nextId++}`;
}
