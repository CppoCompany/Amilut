import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { SortDir } from '../../api/paging';
import { DataGrid, GridColumn, GridSort } from './data-grid';

interface Row {
  id: number;
  name: string | null;
  status: 'open' | 'closed';
}

const COLUMNS: GridColumn<Row>[] = [
  { key: 'id', header: 'מזהה', sortable: true, cssClass: 'data-table__numeric' },
  { key: 'name', header: 'שם', sortable: true },
  {
    key: 'status',
    header: 'סטטוס',
    cell: (row) => (row.status === 'open' ? 'פתוח' : 'סגור'),
    pill: (row) => row.status,
  },
];

@Component({
  imports: [DataGrid],
  template: `
    <app-data-grid
      [columns]="columns"
      [rows]="rows()"
      [loading]="loading()"
      [error]="error()"
      [sort]="sort()"
      [dir]="dir()"
      [page]="page()"
      [pageSize]="2"
      [total]="total()"
      [rowKey]="rowKey"
      (sortChange)="onSort($event)"
      (pageChange)="page.set($event)"
      (rowDblClick)="opened.set($event)"
    />
  `,
})
class HostComponent {
  readonly columns = COLUMNS;
  readonly rows = signal<Row[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly sort = signal<string | null>('id');
  readonly dir = signal<SortDir>('desc');
  readonly page = signal(1);
  readonly total = signal(0);
  readonly opened = signal<Row | null>(null);
  readonly rowKey = (row: Row) => row.id;

  onSort(change: GridSort): void {
    this.sort.set(change.sort);
    this.dir.set(change.dir);
  }
}

describe('DataGrid', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const headers = (): HTMLTableCellElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('thead th'));
  const bodyRows = (): HTMLTableRowElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));
  const cellsOf = (row: HTMLTableRowElement): string[] =>
    Array.from(row.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? '');
  const pagerButtons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.data-grid__pager-btn'));
  const pageLabel = (): string =>
    fixture.nativeElement.querySelector('.data-grid__page-label')?.textContent?.trim() ?? '';

  it('renders the column headers and the Hebrew empty state when there are no rows', () => {
    expect(headers().map((th) => th.textContent?.trim())).toEqual(['מזהה', 'שם', 'סטטוס']);
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0].textContent?.trim()).toBe('אין נתונים להצגה');
    expect(pageLabel()).toBe('עמוד 1 מתוך 1');
  });

  it('shows "טוען..." while loading with no rows yet', () => {
    host.loading.set(true);
    fixture.detectChanges();
    expect(bodyRows()[0].textContent?.trim()).toBe('טוען...');
  });

  it('shows the error above the table', () => {
    host.error.set('טעינת הנתונים נכשלה');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'טעינת הנתונים נכשלה',
    );
  });

  it('renders rows through the cell formatters, with an em dash for empty values and a status pill', () => {
    host.rows.set([
      { id: 1, name: 'ACME', status: 'open' },
      { id: 2, name: null, status: 'closed' },
    ]);
    host.total.set(2);
    fixture.detectChanges();

    expect(cellsOf(bodyRows()[0])).toEqual(['1', 'ACME', 'פתוח']);
    expect(cellsOf(bodyRows()[1])).toEqual(['2', '—', 'סגור']);
    const pill = bodyRows()[0].querySelector('.status-pill');
    expect(pill?.classList.contains('status-pill--open')).toBe(true);
    expect(bodyRows()[0].querySelector('td')?.classList.contains('data-table__numeric')).toBe(true);
  });

  it('clicking a sortable header asks for ascending first, then toggles; other headers are inert', () => {
    const [idHeader, nameHeader, statusHeader] = headers();
    expect(idHeader.getAttribute('aria-sort')).toBe('descending');

    nameHeader.click();
    fixture.detectChanges();
    expect(host.sort()).toBe('name');
    expect(host.dir()).toBe('asc');
    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(idHeader.getAttribute('aria-sort')).toBe('none');

    nameHeader.click();
    fixture.detectChanges();
    expect(host.dir()).toBe('desc');

    statusHeader.click();
    fixture.detectChanges();
    expect(host.sort()).toBe('name');
    expect(statusHeader.getAttribute('aria-sort')).toBeNull();
  });

  it('pages with הקודם/הבא, disabling them at the edges', () => {
    host.rows.set([
      { id: 1, name: 'A', status: 'open' },
      { id: 2, name: 'B', status: 'open' },
    ]);
    host.total.set(5); // page size 2 → 3 pages
    fixture.detectChanges();

    const [prev, next] = pagerButtons();
    expect(pageLabel()).toBe('עמוד 1 מתוך 3');
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.data-grid__range')?.textContent?.trim()).toBe(
      'מציג 1–2 מתוך 5',
    );

    next.click();
    fixture.detectChanges();
    expect(host.page()).toBe(2);
    expect(pageLabel()).toBe('עמוד 2 מתוך 3');
    expect(pagerButtons()[0].disabled).toBe(false);

    host.page.set(3);
    fixture.detectChanges();
    expect(pagerButtons()[1].disabled).toBe(true);
  });

  it('emits the row on double-click', () => {
    const row: Row = { id: 9, name: 'Nine', status: 'open' };
    host.rows.set([row]);
    host.total.set(1);
    fixture.detectChanges();

    bodyRows()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(host.opened()).toEqual(row);
  });
});
