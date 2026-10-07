import { HttpParams } from '@angular/common/http';

/** Sort direction accepted by every paged list endpoint (`dir` query param). */
export type SortDir = 'asc' | 'desc';

/** Page size used by every "view all" list page (server default and max are 25 / 100). */
export const LIST_PAGE_SIZE = 25;

/**
 * Query parameters shared by every paged list endpoint (`GET …/paged`).
 * Feature APIs extend it with their entity filters and a narrowed `sort`.
 */
export interface PagedQueryParams {
  /** Free-text search over the list's main identifiers/names. */
  q?: string;
  /** Created on/after this date (`YYYY-MM-DD`). */
  from?: string;
  /** Created on/before this date (`YYYY-MM-DD`). */
  to?: string;
  sort?: string;
  dir?: SortDir;
  /** 1-based. */
  page?: number;
  pageSize?: number;
}

/** Shape of every paged response: `{ items, total, page, pageSize }`. */
export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Turns a params object into `HttpParams`, dropping `undefined`/`null`/empty-string values. */
export function toHttpParams(params: object): HttpParams {
  let httpParams = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      httpParams = httpParams.set(key, String(value));
    }
  }
  return httpParams;
}
