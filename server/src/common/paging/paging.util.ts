import { Paged } from './paged.dto';
import {
  PAGE_SIZE_DEFAULT,
  PagedQuery,
  SORT_DIRS,
  SortDir,
} from './paged.query';

/** `LIMIT`/`OFFSET` window derived from a 1-based page. */
export interface PageWindow {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
}

export function pageWindow(
  query: Pick<PagedQuery, 'page' | 'pageSize'>,
): PageWindow {
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const pageSize = Math.max(1, Math.trunc(query.pageSize ?? PAGE_SIZE_DEFAULT));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

/**
 * Builds a safe `ORDER BY`. `sortable` is the whitelist mapping a client sort
 * key to a SQL expression; anything not in it (including prototype names such
 * as `constructor`) falls back to `defaultKey`. `dir` is only ever one of the
 * two literals. `tieBreaker` keeps paging stable for equal keys.
 */
export function orderByClause<K extends string>(
  sortable: Readonly<Record<K, string>>,
  sort: string | undefined,
  defaultKey: K,
  dir: SortDir | undefined,
  defaultDir: SortDir,
  tieBreaker: string,
): string {
  const key =
    sort !== undefined && Object.prototype.hasOwnProperty.call(sortable, sort)
      ? (sort as K)
      : defaultKey;
  const direction =
    dir !== undefined && SORT_DIRS.includes(dir) ? dir : defaultDir;
  return `ORDER BY ${sortable[key]} ${direction === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, ${tieBreaker}`;
}

/** Appends `column::date >= $from` / `column::date <= $to` predicates when given. */
export function pushDateRange(
  where: string[],
  params: unknown[],
  column: string,
  from: string | undefined,
  to: string | undefined,
): void {
  if (from !== undefined) {
    params.push(from);
    where.push(`${column}::date >= $${params.length}::date`);
  }
  if (to !== undefined) {
    params.push(to);
    where.push(`${column}::date <= $${params.length}::date`);
  }
}

/** Appends `(expr1 ILIKE $n OR expr2 ILIKE $n …)` for a free-text search. */
export function pushTextSearch(
  where: string[],
  params: unknown[],
  expressions: readonly string[],
  q: string | undefined,
): void {
  const text = q?.trim();
  if (!text) return;
  params.push(`%${text}%`);
  const idx = params.length;
  where.push(
    `(${expressions.map((expr) => `${expr} ILIKE $${idx}`).join(' OR ')})`,
  );
}

/** Row shape when the SELECT carries `count(*) OVER() AS total`. */
export interface WithTotal {
  total: string | number;
}

/** Assembles the page from rows that each carry the window `total`. */
export function toPaged<R extends WithTotal, T>(
  rows: R[],
  window: PageWindow,
  map: (row: NoInfer<R>) => T,
): Paged<T> {
  return {
    items: rows.map(map),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    page: window.page,
    pageSize: window.pageSize,
  };
}
