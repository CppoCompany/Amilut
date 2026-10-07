import type { Observable } from 'rxjs';

import type { PagedResult, SortDir } from '../../../../api/paging';
import type { GridColumn } from '../../../../shared/data-grid/data-grid';
import type { FilterOption } from '../../../../shared/list-filter-bar/list-filter-bar';
import type { ListPageKey } from '../../navigation.model';

/** What a list page hands its `load` function: the filter bar's values, already normalised, plus sort/page. */
export interface ListLoadParams {
  q?: string;
  status?: string;
  customerId?: number;
  /** "מספר תיק" — only when the typed value is a positive integer. */
  caseNumber?: number;
  from?: string;
  to?: string;
  sort: string;
  dir: SortDir;
  page: number;
  pageSize: number;
}

/**
 * Everything that distinguishes one "רשימות" page from another. The generic
 * `ListPage` component renders the title, filter bar and grid from it and
 * owns the fetch/debounce/state plumbing, so each dataset is just a config.
 */
export interface ListPageConfig<T> {
  page: ListPageKey;
  title: string;
  columns: readonly GridColumn<T>[];
  /** Column key sorted by until the user picks one (must be in the endpoint's whitelist). */
  defaultSort: string;
  defaultDir?: SortDir;
  /** Shows the status select with these options; omit for entities without a status. */
  statusOptions?: readonly FilterOption[];
  showCustomer?: boolean;
  showCaseNumber?: boolean;
  searchPlaceholder?: string;
  /** Fetches one page from the server. */
  load: (params: ListLoadParams) => Observable<PagedResult<T>>;
  /** Row double-click — opens the entity's edit screen when one exists. */
  open?: (row: T) => void;
  rowKey: (row: T) => string | number;
  errorText?: string;
}
