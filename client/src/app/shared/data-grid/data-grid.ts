import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { SortDir } from '../../api/paging';

/**
 * One column of a {@link DataGrid}. `key` doubles as the sort key sent to the
 * server (it must be in the endpoint's whitelist when `sortable`) and as the
 * default field read off the row when no `cell` formatter is given.
 */
export interface GridColumn<T> {
  key: string;
  /** Header label (Hebrew). */
  header: string;
  sortable?: boolean;
  /** Text shown in the cell; defaults to `String(row[key])` (em dash when empty). */
  cell?: (row: T) => string;
  /** Extra class on every `<td>`, e.g. `data-table__numeric`. */
  cssClass?: string;
  /** When given, the cell renders a `.status-pill--<value>` around the text (`null` = plain text). */
  pill?: (row: T) => string | null;
}

export interface GridSort {
  sort: string;
  dir: SortDir;
}

/**
 * Reusable server-paged table for the "רשימות" pages: column definitions in,
 * rows/total in, sort + page events out. Sorting and paging are the parent's
 * job (it re-fetches); this component only renders state and emits intents.
 * Row double-click mirrors the existing grids ("לחץ פעמיים לעריכה").
 */
@Component({
  selector: 'app-data-grid',
  templateUrl: './data-grid.html',
  styleUrl: './data-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataGrid<T> {
  readonly columns = input.required<readonly GridColumn<T>[]>();
  readonly rows = input.required<readonly T[]>();
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  /** Active sort key (`null` = none highlighted). */
  readonly sort = input<string | null>(null);
  readonly dir = input<SortDir>('desc');
  /** 1-based current page. */
  readonly page = input(1);
  readonly pageSize = input(25);
  /** Total rows across all pages (drives the pager). */
  readonly total = input(0);
  readonly emptyText = input('אין נתונים להצגה');
  /** Stable identity for `track`; defaults to the row's index. */
  readonly rowKey = input<((row: T) => string | number) | null>(null);

  readonly sortChange = output<GridSort>();
  readonly pageChange = output<number>();
  readonly rowDblClick = output<T>();

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / Math.max(1, this.pageSize()))),
  );
  protected readonly hasPrev = computed(() => this.page() > 1);
  protected readonly hasNext = computed(() => this.page() < this.pageCount());

  /** "מציג 26–50 מתוך 137", or just the total when the page is empty. */
  protected readonly rangeText = computed(() => {
    const total = this.total();
    if (total === 0 || this.rows().length === 0) return `סה"כ ${total}`;
    const first = (this.page() - 1) * this.pageSize() + 1;
    const last = Math.min(total, first + this.rows().length - 1);
    return `מציג ${first}–${last} מתוך ${total}`;
  });

  protected onHeaderClick(column: GridColumn<T>): void {
    if (!column.sortable) return;
    const dir: SortDir = this.sort() === column.key && this.dir() === 'asc' ? 'desc' : 'asc';
    this.sortChange.emit({ sort: column.key, dir });
  }

  protected ariaSort(column: GridColumn<T>): 'ascending' | 'descending' | 'none' | null {
    if (!column.sortable) return null;
    if (this.sort() !== column.key) return 'none';
    return this.dir() === 'asc' ? 'ascending' : 'descending';
  }

  protected cellText(column: GridColumn<T>, row: T): string {
    if (column.cell) return column.cell(row);
    const value = (row as Record<string, unknown>)[column.key];
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }

  protected pillOf(column: GridColumn<T>, row: T): string | null {
    return column.pill ? column.pill(row) : null;
  }

  protected trackRow(index: number, row: T): string | number {
    const key = this.rowKey();
    return key ? key(row) : index;
  }

  protected goTo(page: number): void {
    if (page < 1 || page > this.pageCount() || page === this.page()) return;
    this.pageChange.emit(page);
  }
}
