import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';

/** One choice offered by {@link SearchSelect}. */
export interface SearchSelectOption<T> {
  value: T;
  label: string;
}

/** How many rows the open list shows before it scrolls. */
export const DEFAULT_MAX_VISIBLE = 8;
const ROW_HEIGHT_PX = 36;

let nextId = 0;

/**
 * Single-choice dropdown with type-to-search, on PrimeNG's select with its
 * filter box (case-insensitive substring on the label). When `clearLabel` is
 * set, a first row with that text picks `null`.
 *
 * Purely presentational — emits the picked value and never stores the
 * selection itself.
 */
@Component({
  selector: 'app-search-select',
  imports: [FormsModule, Select],
  templateUrl: './search-select.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchSelect<T> {
  readonly options = input.required<readonly SearchSelectOption<T>[]>();
  readonly selected = input<T | null>(null);
  readonly placeholder = input('הקלד לחיפוש...');
  /** Text of an extra first row that picks `null`; no such row when unset. */
  readonly clearLabel = input<string | null>(null);
  readonly disabled = input(false);
  readonly maxVisible = input(DEFAULT_MAX_VISIBLE);
  /** `id` for the inner input so a parent `<label for>` can point at it. */
  readonly inputId = input(`search-select-${nextId++}`);

  readonly selectedChange = output<T | null>();

  /** The list as shown: the optional clear row, then every option. */
  readonly rows = computed<readonly SearchSelectOption<T | null>[]>(() => {
    const clearLabel = this.clearLabel();
    return clearLabel !== null
      ? [{ value: null, label: clearLabel }, ...this.options()]
      : this.options();
  });

  protected readonly scrollHeight = computed(() => `${this.maxVisible() * ROW_HEIGHT_PX}px`);

  onChange(value: T | null | undefined): void {
    this.selectedChange.emit(value ?? null);
  }
}
