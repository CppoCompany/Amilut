import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TableModule } from 'primeng/table';

import { TypedRow } from '../typed-row/typed-row';
import { compareSortKeys, TableSort, toSortKey } from './table-sort';

interface Row {
  id: number;
  name: string | null;
  status: 'open' | 'closed';
  tags: string[];
}

const LABELS: Record<Row['status'], string> = { open: 'פתוח', closed: 'סגור' };

@Component({
  imports: [TableModule, TableSort, TypedRow],
  template: `
    <p-table [value]="rows()" [appTableSort]="accessors">
      <ng-template #header>
        <tr>
          <th pSortableColumn="id">מזהה <p-sortIcon field="id" /></th>
          <th pSortableColumn="name">שם <p-sortIcon field="name" /></th>
          <th pSortableColumn="status">סטטוס <p-sortIcon field="status" /></th>
          <th pSortableColumn="tags">תגיות <p-sortIcon field="tags" /></th>
        </tr>
      </ng-template>
      <ng-template #body let-row [rowOf]="rows()">
        <tr>
          <td class="id">{{ row.id }}</td>
          <td>{{ row.name }}</td>
          <td>{{ row.status }}</td>
          <td>{{ row.tags.join(', ') }}</td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
class HostComponent {
  readonly rows = signal<Row[]>([
    { id: 10, name: 'בננה', status: 'open', tags: ['b'] },
    { id: 2, name: null, status: 'closed', tags: [] },
    { id: 33, name: 'אגס', status: 'open', tags: ['a', 'c'] },
  ]);
  readonly accessors = { status: (row: Row) => LABELS[row.status] };
}

describe('TableSort', () => {
  let fixture: ComponentFixture<HostComponent>;

  const ids = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('td.id') as NodeListOf<HTMLElement>).map((td) =>
      td.textContent!.trim(),
    );
  const clickHeader = async (index: number): Promise<void> => {
    (fixture.nativeElement.querySelectorAll('th')[index] as HTMLElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('sorts numbers numerically, and flips direction on a second click', async () => {
    await clickHeader(0);
    expect(ids()).toEqual(['2', '10', '33']);
    await clickHeader(0);
    expect(ids()).toEqual(['33', '10', '2']);
  });

  it('keeps empty values last in both directions', async () => {
    await clickHeader(1);
    expect(ids()).toEqual(['33', '10', '2']);
    await clickHeader(1);
    expect(ids()).toEqual(['10', '33', '2']);
  });

  it('sorts by the accessor when one is given', async () => {
    await clickHeader(2);
    // סגור < פתוח
    expect(ids()).toEqual(['2', '10', '33']);
  });

  it('never reorders the bound array', async () => {
    const before = fixture.componentInstance.rows();
    await clickHeader(0);
    expect(fixture.componentInstance.rows()).toBe(before);
    expect(before.map((r) => r.id)).toEqual([10, 2, 33]);
  });

  it('keeps the sort when the rows are replaced', async () => {
    await clickHeader(0);
    fixture.componentInstance.rows.update((rows) => [...rows, { id: 1, name: 'x', status: 'open', tags: [] }]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(ids()).toEqual(['1', '2', '10', '33']);
  });
});

describe('toSortKey / compareSortKeys', () => {
  it('treats null, blank, em dash and empty arrays as empty', () => {
    for (const value of [null, undefined, '', '  ', '—', [], Number.NaN]) {
      expect(toSortKey(value)).toBeNull();
    }
  });

  it('joins arrays and compares digit runs numerically', () => {
    expect(toSortKey(['a', 'b'])).toBe('a, b');
    expect(compareSortKeys('CCF-9', 'CCF-10', 1)).toBeLessThan(0);
    expect(compareSortKeys(null, 'a', -1)).toBeGreaterThan(0);
  });
});
