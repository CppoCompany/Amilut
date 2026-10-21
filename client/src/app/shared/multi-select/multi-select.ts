import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MultiSelect as PMultiSelect } from 'primeng/multiselect';

/** One choice offered by {@link MultiSelect}. */
export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * Compact multi-choice dropdown for dense tables, on PrimeNG's multiselect.
 * The panel is appended to `body` so it escapes scrolling table wrappers.
 * Purely presentational — emits the new selection (in option order) and
 * never stores state itself.
 */
@Component({
  selector: 'app-multi-select',
  imports: [FormsModule, PMultiSelect],
  templateUrl: './multi-select.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultiSelect {
  readonly options = input.required<readonly MultiSelectOption[]>();
  readonly selected = input<readonly string[]>([]);
  readonly placeholder = input('בחר');
  readonly ariaLabel = input<string | null>(null);

  readonly selectedChange = output<string[]>();

  /** Emit in option order so the selection is stable regardless of click order. */
  onChange(values: readonly string[] | null): void {
    const next = new Set(values ?? []);
    this.selectedChange.emit(
      this.options()
        .map((option) => option.value)
        .filter((candidate) => next.has(candidate)),
    );
  }
}
