import { Injectable } from '@angular/core';

import type { CustomerDto } from '../../../../api/models';
import type { SortDir } from '../../../../api/paging';
import type { ListPageKey } from '../../navigation.model';

/** The filter bar's values. Strings are the raw input values (`''` = not set). */
export interface ListFilters {
  q: string;
  status: string;
  customer: CustomerDto | null;
  /** "מספר תיק" as typed (validated to a positive integer when sent). */
  caseNumber: string;
  from: string;
  to: string;
}

/** Everything a list page needs to come back exactly as the user left it. */
export interface ListViewState extends ListFilters {
  sort: string;
  dir: SortDir;
  page: number;
}

export const EMPTY_LIST_FILTERS: Readonly<ListFilters> = Object.freeze({
  q: '',
  status: '',
  customer: null,
  caseNumber: '',
  from: '',
  to: '',
});

/**
 * Remembers each "רשימות" page's filters, sort and page while the user moves
 * between workspace screens (the screens are swapped inside one shell, so
 * there is no URL to carry this). Pages read it on init and write it on
 * every change; "נקה" resets the filters but keeps the sort.
 */
@Injectable({ providedIn: 'root' })
export class ListStateService {
  private readonly states = new Map<ListPageKey, ListViewState>();

  /** The saved state, or a fresh one with the given default sort when the page was never visited. */
  get(page: ListPageKey, defaultSort: string, defaultDir: SortDir = 'desc'): ListViewState {
    return this.states.get(page) ?? { ...EMPTY_LIST_FILTERS, sort: defaultSort, dir: defaultDir, page: 1 };
  }

  set(page: ListPageKey, state: ListViewState): void {
    this.states.set(page, { ...state });
  }

  /** Forgets everything saved for the page (next `get` returns the defaults). */
  reset(page: ListPageKey): void {
    this.states.delete(page);
  }
}
