import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';

/** One choice offered by {@link SearchSelect}. */
export interface SearchSelectOption<T> {
  value: T;
  label: string;
}

/** How many rows the open list shows before it scrolls. */
export const DEFAULT_MAX_VISIBLE = 8;

let nextId = 0;

/**
 * Single-choice dropdown with type-to-search: a `form-control` text input that
 * filters `options` by label (case-insensitive substring) as the user types,
 * and a list that shows at most `maxVisible` rows at a time (the rest scroll).
 * Keyboard: ↑/↓ move, Enter picks, Escape closes. When `clearLabel` is set,
 * a first row with that text picks `null`.
 *
 * Purely presentational — emits the picked value and never stores the
 * selection itself; the input shows the label of `selected` while closed.
 */
@Component({
  selector: 'app-search-select',
  templateUrl: './search-select.html',
  styleUrl: './search-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'autocomplete-wrapper',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class SearchSelect<T> {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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

  protected readonly open = signal(false);
  /** Index into `rows()`; `-1` = nothing active. */
  protected readonly activeIndex = signal(-1);

  private readonly selectedLabel = computed(() => {
    const selected = this.selected();
    if (selected === null) return '';
    return this.options().find((option) => option.value === selected)?.label ?? '';
  });

  /** What the input shows: the selection's label until the user types, then their query. */
  protected readonly text = linkedSignal(() => this.selectedLabel());
  /** True once the user typed since the list opened — only then does the text filter. */
  private readonly searching = signal(false);

  /** The list as shown: the optional clear row, then every option matching the query. */
  protected readonly rows = computed<readonly SearchSelectOption<T | null>[]>(() => {
    const query = this.searching() ? this.text().trim().toLowerCase() : '';
    const matches = query
      ? this.options().filter((option) => option.label.toLowerCase().includes(query))
      : this.options();
    const clearLabel = this.clearLabel();
    return clearLabel !== null && !query ? [{ value: null, label: clearLabel }, ...matches] : matches;
  });

  protected readonly listId = computed(() => `${this.inputId()}-list`);

  protected readonly activeOptionId = computed(() => {
    const index = this.activeIndex();
    return this.open() && index >= 0 ? this.optionId(index) : null;
  });

  protected onFocus(event: FocusEvent): void {
    // Select the shown label so typing replaces it with a query.
    (event.target as HTMLInputElement).select();
    this.openList();
  }

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
    this.searching.set(true);
    this.open.set(true);
    this.activeIndex.set(this.rows().length > 0 ? 0 : -1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) {
          this.openList();
        } else {
          this.moveActive(1);
        }
        break;
      case 'ArrowUp':
        if (this.open()) {
          event.preventDefault();
          this.moveActive(-1);
        }
        break;
      case 'Enter':
        if (this.open()) {
          event.preventDefault();
          const row = this.rows()[this.activeIndex()];
          if (row) this.pick(row);
        }
        break;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
        break;
    }
  }

  protected onBlur(): void {
    this.close();
  }

  /** Keep focus in the input when clicking inside the list (so blur does not close it first). */
  protected onListMousedown(event: MouseEvent): void {
    event.preventDefault();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  protected pick(row: SearchSelectOption<T | null>): void {
    this.selectedChange.emit(row.value);
    this.close();
    // The parent may keep the same selection — show its label again either way.
    this.text.set(row.value === null ? '' : row.label);
  }

  protected setActive(index: number): void {
    this.activeIndex.set(index);
  }

  protected isSelected(row: SearchSelectOption<T | null>): boolean {
    return row.value === this.selected();
  }

  protected optionId(index: number): string {
    return `${this.listId()}-option-${index}`;
  }

  private openList(): void {
    if (this.disabled()) return;
    this.searching.set(false);
    this.open.set(true);
    const selectedIndex = this.rows().findIndex((row) => this.isSelected(row));
    this.activeIndex.set(selectedIndex);
    if (selectedIndex >= 0) {
      // The list renders on the next change detection; scroll after it.
      queueMicrotask(() => this.scrollActiveIntoView(selectedIndex));
    }
  }

  private close(): void {
    this.open.set(false);
    this.searching.set(false);
    this.activeIndex.set(-1);
    // Drop an unfinished query — the input goes back to the current selection.
    this.text.set(this.selectedLabel());
  }

  private moveActive(delta: number): void {
    const count = this.rows().length;
    if (count === 0) return;
    const current = this.activeIndex();
    const next = current < 0 ? (delta > 0 ? 0 : count - 1) : (current + delta + count) % count;
    this.activeIndex.set(next);
    this.scrollActiveIntoView(next);
  }

  private scrollActiveIntoView(index: number): void {
    const el = this.host.nativeElement.querySelector<HTMLElement>(`#${this.optionId(index)}`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }
}
