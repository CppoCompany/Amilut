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
  const prevButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.p-paginator-prev');
  const nextButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.p-paginator-next');
  const pageLinks = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.p-paginator-page')).map(
      (el) => (el as HTMLElement).textContent?.trim() ?? '',
    );
  const currentPage = (): string =>
    fixture.nativeElement.querySelector('.p-paginator-page-selected')?.textContent?.trim() ?? '';

  it('renders the column headers and the Hebrew empty state when there are no rows', () => {
    expect(headers().map((th) => th.textContent?.trim())).toEqual(['מזהה', 'שם', 'סטטוס']);
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0].textContent?.trim()).toBe('אין נתונים להצגה');
    expect(fixture.nativeElement.querySelector('.data-grid__range')?.textContent?.trim()).toBe('סה"כ 0');
  });

  it('shows the table loading mask while loading', () => {
    host.loading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.p-datatable-mask')).not.toBeNull();
  });

  it('shows the error above the table', () => {
    host.error.set('טעינת הנתונים נכשלה');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'טעינת הנתונים נכשלה',
    );
  });

  it('renders rows through the cell formatters, with an em dash for empty values and a status tag', () => {
    host.rows.set([
      { id: 1, name: 'ACME', status: 'open' },
      { id: 2, name: null, status: 'closed' },
    ]);
    host.total.set(2);
    fixture.detectChanges();

    expect(cellsOf(bodyRows()[0])).toEqual(['1', 'ACME', 'פתוח']);
    expect(cellsOf(bodyRows()[1])).toEqual(['2', '—', 'סגור']);
    const tag = bodyRows()[0].querySelector('.p-tag');
    expect(tag?.classList.contains('status-tag--open')).toBe(true);
    expect(tag?.classList.contains('p-tag-info')).toBe(true);
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

  it('pages with the paginator, disabling prev/next at the edges', () => {
    host.rows.set([
      { id: 1, name: 'A', status: 'open' },
      { id: 2, name: 'B', status: 'open' },
    ]);
    host.total.set(5); // page size 2 → 3 pages
    fixture.detectChanges();

    expect(pageLinks()).toEqual(['1', '2', '3']);
    expect(currentPage()).toBe('1');
    expect(prevButton().disabled).toBe(true);
    expect(nextButton().disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.data-grid__range')?.textContent?.trim()).toBe(
      'מציג 1–2 מתוך 5',
    );

    nextButton().click();
    fixture.detectChanges();
    expect(host.page()).toBe(2);
    expect(currentPage()).toBe('2');
    expect(prevButton().disabled).toBe(false);

    host.page.set(3);
    fixture.detectChanges();
    expect(nextButton().disabled).toBe(true);
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
