import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Skeleton } from 'primeng/skeleton';

/** Bar widths (percent) cycled across cells so the placeholder reads as real, uneven content. */
const WIDTHS = [72, 44, 60, 36, 54, 66, 48];

/**
 * Loading placeholder shaped like a table: `rows` lines of `columns`
 * PrimeNG skeleton bars each. The visible bars are decorative; the real
 * announcement is the visually-hidden "טוען..." line, which also keeps the
 * `.data-table__empty` contract every card's tests read.
 */
@Component({
  selector: 'app-table-skeleton',
  imports: [Skeleton],
  templateUrl: './table-skeleton.html',
  styleUrl: './table-skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableSkeleton {
  readonly columns = input(4);
  readonly rows = input(3);
  readonly label = input('טוען...');

  protected readonly rowIndexes = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
  protected readonly columnIndexes = computed(() =>
    Array.from({ length: this.columns() }, (_, i) => i),
  );

  protected widthFor(column: number, row: number): number {
    return WIDTHS[(column * 3 + row) % WIDTHS.length];
  }
}
