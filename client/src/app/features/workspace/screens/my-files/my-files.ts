import { ScrollingModule } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { SHIPMENT_DOCUMENT_TYPE_LABELS } from '../../../../api/enums';
import type { CustomerDto, ShipmentSummaryDto } from '../../../../api/models';
import { ListShipmentsParams, ShipmentsApi } from '../../../../api/shipments-api';
import { CustomerAutocomplete } from '../../../customers/customer-autocomplete/customer-autocomplete';
import { NavigationService } from '../../navigation.service';

/** Single batch fetched per filter change; rendering beyond this is virtualized, not paginated. */
const MAX_ROWS = 200;

/** "התיקים שלי" — filterable grid over all shipment files, virtual-scrolled. */
@Component({
  selector: 'app-my-files-screen',
  imports: [FormsModule, ScrollingModule, CustomerAutocomplete],
  templateUrl: './my-files.html',
  styleUrl: './my-files.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyFilesScreen {
  private readonly shipmentsApi = inject(ShipmentsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);

  protected readonly documentTypeLabels = SHIPMENT_DOCUMENT_TYPE_LABELS;

  // ── Filters (applied on demand, not live-as-you-type) ─────────────────────
  protected readonly filterCustomer = signal<CustomerDto | null>(null);
  protected readonly filterForwarderName = signal('');
  protected readonly filterCaseNumber = signal('');

  // ── Grid state ──────────────────────────────────────────────────────────────
  protected readonly shipments = signal<ShipmentSummaryDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.fetch();
  }

  protected applyFilters(): void {
    this.fetch();
  }

  protected clearFilters(): void {
    this.filterCustomer.set(null);
    this.filterForwarderName.set('');
    this.filterCaseNumber.set('');
    this.fetch();
  }

  /** Double-click a row to edit that case in "יצירת תיק חדש". */
  protected onEditCase(shipment: ShipmentSummaryDto): void {
    this.nav.openShipmentForEdit(shipment.orderId);
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  protected trackById(_index: number, shipment: ShipmentSummaryDto): number {
    return shipment.id;
  }

  private fetch(): void {
    const params: ListShipmentsParams = { limit: MAX_ROWS };

    const customerId = this.filterCustomer()?.id;
    if (customerId !== undefined) {
      params.customerId = customerId;
    }
    const forwarderName = this.filterForwarderName().trim();
    if (forwarderName) {
      params.forwarderName = forwarderName;
    }
    const caseNumberText = this.filterCaseNumber().trim();
    if (caseNumberText) {
      const caseNumber = Number(caseNumberText);
      if (Number.isInteger(caseNumber) && caseNumber > 0) {
        params.caseNumber = caseNumber;
      }
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.shipmentsApi
      .list(params)
      .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.shipments.set(rows),
        error: () => {
          this.shipments.set([]);
          this.errorMessage.set('טעינת התיקים נכשלה');
        },
      });
  }
}
