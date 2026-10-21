import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Message } from 'primeng/message';
import { PaginatorState, Paginator } from 'primeng/paginator';
import { SortEvent } from 'primeng/api';
import { TableModule } from 'primeng/table';

import type { SortDir } from '../../api/paging';
import { StatusTag } from '../status-tag/status-tag';

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
  /** When given, the cell renders a status tag for that value (`null` = plain text). */
  pill?: (row: T) => string | null;
}

export interface GridSort {
  sort: string;
  dir: SortDir;
}

/**
 * Reusable server-paged table for the "רשימות" pages, on PrimeNG's table
 * (lazy sort) and paginator: column definitions in, rows/total in, sort +
 * page events out. Sorting and paging are the parent's job (it re-fetches);
 * this component only renders state and emits intents. Row double-click
 * mirrors the other grids ("לחץ פעמיים לפתיחה").
 */
@Component({
  selector: 'app-data-grid',
  imports: [TableModule, Paginator, Message, StatusTag],
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
  /** Stable identity for row tracking; defaults to the row's index. */
  readonly rowKey = input<((row: T) => string | number) | null>(null);

  readonly sortChange = output<GridSort>();
  readonly pageChange = output<number>();
  readonly rowDblClick = output<T>();

  protected readonly sortOrder = computed(() => (this.dir() === 'asc' ? 1 : -1));
  protected readonly first = computed(() => (this.page() - 1) * this.pageSize());

  /** "מציג 26–50 מתוך 137", or just the total when the page is empty. */
  protected readonly rangeText = computed(() => {
    const total = this.total();
    if (total === 0 || this.rows().length === 0) return `סה"כ ${total}`;
    const first = this.first() + 1;
    const last = Math.min(total, first + this.rows().length - 1);
    return `מציג ${first}–${last} מתוך ${total}`;
  });

  protected readonly trackBy = (index: number, row: T): string | number => {
    const key = this.rowKey();
    return key ? key(row) : index;
  };

  /** PrimeNG re-emits when the parent echoes the sort back; only real changes go out. */
  onSort(event: SortEvent): void {
    if (!event.field) return;
    const dir: SortDir = event.order === -1 ? 'desc' : 'asc';
    if (event.field === this.sort() && dir === this.dir()) return;
    this.sortChange.emit({ sort: event.field, dir });
  }

  onPage(state: PaginatorState): void {
    const page = (state.page ?? 0) + 1;
    if (page !== this.page()) this.pageChange.emit(page);
  }

  protected cellText(column: GridColumn<T>, row: T): string {
    if (column.cell) return column.cell(row);
    const value = (row as Record<string, unknown>)[column.key];
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }

  protected pillOf(column: GridColumn<T>, row: T): string | null {
    return column.pill ? column.pill(row) : null;
  }
}
