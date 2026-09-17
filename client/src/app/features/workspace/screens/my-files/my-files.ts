import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { SHIPMENT_DOCUMENT_TYPE_LABELS } from '../../../../api/enums';
import type { ShipmentSummaryDto } from '../../../../api/models';
import { ShipmentsApi } from '../../../../api/shipments-api';

const PAGE_SIZE = 20;

/** "התיקים שלי" — paginated grid over all shipment files. */
@Component({
  selector: 'app-my-files-screen',
  templateUrl: './my-files.html',
  styleUrl: './my-files.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyFilesScreen {
  private readonly shipmentsApi = inject(ShipmentsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly documentTypeLabels = SHIPMENT_DOCUMENT_TYPE_LABELS;

  protected readonly shipments = signal<ShipmentSummaryDto[]>([]);
  protected readonly page = signal(0);
  protected readonly hasNextPage = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly pageSize = PAGE_SIZE;

  constructor() {
    this.fetch();
  }

  protected nextPage(): void {
    if (!this.hasNextPage() || this.loading()) return;
    this.page.update((p) => p + 1);
    this.fetch();
  }

  protected prevPage(): void {
    if (this.page() === 0 || this.loading()) return;
    this.page.update((p) => p - 1);
    this.fetch();
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  private fetch(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.shipmentsApi
      .list({ limit: this.pageSize, offset: this.page() * this.pageSize })
      .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.shipments.set(rows);
          this.hasNextPage.set(rows.length === this.pageSize);
        },
        error: () => {
          this.shipments.set([]);
          this.hasNextPage.set(false);
          this.errorMessage.set('טעינת התיקים נכשלה');
        },
      });
  }
}
