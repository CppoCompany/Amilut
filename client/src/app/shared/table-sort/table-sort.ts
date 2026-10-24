import { Directive, inject, input } from '@angular/core';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';

/**
 * Per-field sort value, for columns whose cell text is not the raw field
 * (enum labels, counts, computed text). Keys are the `pSortableColumn` names.
 */
export type SortAccessors<T> = Readonly<Record<string, (row: T) => unknown>>;

type SortKey = string | number | null;

const collator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' });

/**
 * Client-side sorting for every in-memory (non-lazy) `p-table`: mark the
 * header cells with `pSortableColumn="field"` + `<p-sortIcon field="field" />`
 * and put `appTableSort` on the table. Unlike PrimeNG's built-in sort it
 * sorts a copy, so the bound (signal) array is never reordered in place;
 * compares text with a Hebrew, numeric-aware collator; keeps empty values last
 * in both directions; and compares arrays by their joined text, as the cells
 * show them. Pass `[appTableSort]="{ status: (row) => label }"` to sort a
 * column by something other than the raw field. Server-paged grids sort on
 * the server instead (`app-data-grid`).
 */
@Directive({ selector: 'p-table[appTableSort]' })
export class TableSort<T> {
  readonly appTableSort = input<SortAccessors<T> | ''>('');

  private readonly table = inject(Table);

  constructor() {
    this.table.customSort = true;
    this.table.sortFunction.subscribe((event: SortEvent) => this.sort(event));
  }

  private sort(event: SortEvent): void {
    const field = event.field;
    const rows = event.data as T[] | undefined;
    if (!field || !rows) return;

    const accessor = this.appTableSort() || {};
    const valueOf = accessor[field] ?? ((row: T) => resolveField(row, field));
    const order = event.order === -1 ? -1 : 1;

    // Array#sort is stable, so equal keys keep their incoming order.
    this.table.value = rows
      .map((row) => ({ row, key: toSortKey(valueOf(row)) }))
      .sort((a, b) => compareSortKeys(a.key, b.key, order))
      .map(({ row }) => row);
  }
}

/** Reads `a.b.c` off a row. */
function resolveField(row: unknown, field: string): unknown {
  return field
    .split('.')
    .reduce<unknown>((value, part) => (value == null ? value : (value as Record<string, unknown>)[part]), row);
}

/** Normalises a cell value to something comparable; `null` = empty. */
export function toSortKey(value: unknown): SortKey {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return value.length ? value.join(', ') : null;
  const text = String(value).trim();
  return text === '' || text === '—' ? null : text;
}

/** Empty keys go last whichever way the column is sorted. */
export function compareSortKeys(a: SortKey, b: SortKey, order: 1 | -1): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const result =
    typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b));
  return order * result;
}
