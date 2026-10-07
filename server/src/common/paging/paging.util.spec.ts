import {
  orderByClause,
  pageWindow,
  pushDateRange,
  pushTextSearch,
  toPaged,
} from './paging.util';

const SORTABLE = { id: 't.id', name: 't.name' } as const;

describe('paging.util', () => {
  describe('pageWindow', () => {
    it('defaults to page 1 of 25', () => {
      expect(pageWindow({})).toEqual({
        page: 1,
        pageSize: 25,
        limit: 25,
        offset: 0,
      });
    });

    it('derives the offset from a 1-based page', () => {
      expect(pageWindow({ page: 3, pageSize: 10 })).toEqual({
        page: 3,
        pageSize: 10,
        limit: 10,
        offset: 20,
      });
    });

    it('never goes below page 1 / size 1', () => {
      expect(pageWindow({ page: 0, pageSize: 0 })).toEqual({
        page: 1,
        pageSize: 1,
        limit: 1,
        offset: 0,
      });
    });
  });

  describe('orderByClause', () => {
    it('maps a whitelisted key and direction, with a tie breaker', () => {
      expect(
        orderByClause(SORTABLE, 'name', 'id', 'asc', 'desc', 't.id DESC'),
      ).toBe('ORDER BY t.name ASC NULLS LAST, t.id DESC');
    });

    it('falls back to the defaults when sort/dir are missing', () => {
      expect(
        orderByClause(
          SORTABLE,
          undefined,
          'id',
          undefined,
          'desc',
          't.id DESC',
        ),
      ).toBe('ORDER BY t.id DESC NULLS LAST, t.id DESC');
    });

    it('never interpolates a key outside the whitelist (including prototype names)', () => {
      expect(
        orderByClause(
          SORTABLE,
          't.id; DROP TABLE t',
          'id',
          'asc',
          'desc',
          't.id DESC',
        ),
      ).toBe('ORDER BY t.id ASC NULLS LAST, t.id DESC');
      expect(
        orderByClause(
          SORTABLE,
          'constructor',
          'id',
          'asc',
          'desc',
          't.id DESC',
        ),
      ).toBe('ORDER BY t.id ASC NULLS LAST, t.id DESC');
      expect(
        orderByClause(
          SORTABLE,
          'name',
          'id',
          'sideways' as unknown as 'asc',
          'desc',
          't.id DESC',
        ),
      ).toBe('ORDER BY t.name DESC NULLS LAST, t.id DESC');
    });
  });

  describe('pushDateRange', () => {
    it('adds inclusive date bounds as parameters', () => {
      const where: string[] = [];
      const params: unknown[] = ['x'];
      pushDateRange(where, params, 't.created_at', '2026-01-01', '2026-01-31');
      expect(where).toEqual([
        't.created_at::date >= $2::date',
        't.created_at::date <= $3::date',
      ]);
      expect(params).toEqual(['x', '2026-01-01', '2026-01-31']);
    });

    it('adds nothing when both bounds are missing', () => {
      const where: string[] = [];
      const params: unknown[] = [];
      pushDateRange(where, params, 't.created_at', undefined, undefined);
      expect(where).toEqual([]);
      expect(params).toEqual([]);
    });
  });

  describe('pushTextSearch', () => {
    it('ORs an ILIKE over every expression with a single parameter', () => {
      const where: string[] = [];
      const params: unknown[] = [];
      pushTextSearch(where, params, ['a.x', 'b.y'], '  acme ');
      expect(where).toEqual(['(a.x ILIKE $1 OR b.y ILIKE $1)']);
      expect(params).toEqual(['%acme%']);
    });

    it('ignores a blank query', () => {
      const where: string[] = [];
      const params: unknown[] = [];
      pushTextSearch(where, params, ['a.x'], '   ');
      pushTextSearch(where, params, ['a.x'], undefined);
      expect(where).toEqual([]);
      expect(params).toEqual([]);
    });
  });

  describe('toPaged', () => {
    it('reads the window total off the first row and maps every row', () => {
      const page = toPaged(
        [
          { total: '7', v: 1 },
          { total: '7', v: 2 },
        ],
        pageWindow({ page: 2, pageSize: 2 }),
        (row) => row.v * 10,
      );
      expect(page).toEqual({ items: [10, 20], total: 7, page: 2, pageSize: 2 });
    });

    it('reports total 0 for an empty page', () => {
      expect(
        toPaged([], pageWindow({}), (row: { total: number }) => row),
      ).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
    });
  });
});
