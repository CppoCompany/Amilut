import { ScrollingModule } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { combineLatest, debounceTime, finalize, skip } from 'rxjs';

import { SHIPMENT_DOCUMENT_TYPE_LABELS } from '../../../../api/enums';
import type { CustomerDto, ShipmentSummaryDto } from '../../../../api/models';
import { ListShipmentsParams, ShipmentsApi } from '../../../../api/shipments-api';
import { ConfirmDialog } from '../../../../shared/confirm-dialog/confirm-dialog';
import {
  CustomerAutocomplete,
  SEARCH_DEBOUNCE_MS,
} from '../../../customers/customer-autocomplete/customer-autocomplete';
import { NavigationService } from '../../navigation.service';

/** Single batch fetched per filter change; rendering beyond this is virtualized, not paginated. */
const MAX_ROWS = 200;

/** "התיקים שלי" — filterable grid over all shipment files, virtual-scrolled. */
@Component({
  selector: 'app-my-files-screen',
  imports: [FormsModule, ScrollingModule, CustomerAutocomplete, ConfirmDialog],
  templateUrl: './my-files.html',
  styleUrl: './my-files.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyFilesScreen {
  private readonly shipmentsApi = inject(ShipmentsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);

  protected readonly documentTypeLabels = SHIPMENT_DOCUMENT_TYPE_LABELS;

  // ── Filters (live — debounced, no apply button) ────────────────────────────
  protected readonly filterCustomer = signal<CustomerDto | null>(null);
  protected readonly filterForwarderName = signal('');
  protected readonly filterCaseNumber = signal('');

  // ── Grid state ──────────────────────────────────────────────────────────────
  protected readonly shipments = signal<ShipmentSummaryDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  /** Case ids currently being deleted — disables their row's delete button mid-request. */
  protected readonly deletingIds = signal<ReadonlySet<number>>(new Set());
  /** The case awaiting delete confirmation in the modal, or `null`. */
  protected readonly pendingDelete = signal<ShipmentSummaryDto | null>(null);

  constructor() {
    this.fetch();

    combineLatest([
      toObservable(this.filterCustomer),
      toObservable(this.filterForwarderName),
      toObservable(this.filterCaseNumber),
    ])
      .pipe(
        skip(1), // the initial load above already happened
        debounceTime(SEARCH_DEBOUNCE_MS),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.fetch());
  }

  protected clearFilters(): void {
    this.filterCustomer.set(null);
    this.filterForwarderName.set('');
    this.filterCaseNumber.set('');
  }

  /** Double-click a row to edit that case in "יצירת תיק חדש". */
  protected onEditCase(shipment: ShipmentSummaryDto): void {
    this.nav.openCaseForEdit(shipment.id);
  }

  protected joinOrEmDash(values: readonly (string | number)[]): string {
    return values.length ? values.join(', ') : '—';
  }

  protected isDeleting(caseId: number): boolean {
    return this.deletingIds().has(caseId);
  }

  /** Opens the confirm-delete modal for this row. */
  protected onDeleteCase(shipment: ShipmentSummaryDto, event: Event): void {
    event.stopPropagation();
    if (this.isDeleting(shipment.id)) return;
    this.pendingDelete.set(shipment);
  }

  protected cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /** Confirmed via the modal — deletes the case and removes its row from the
   *  grid. Its orders are freed back to unassigned automatically (server-side FK). */
  protected confirmDelete(): void {
    const shipment = this.pendingDelete();
    if (!shipment) return;
    this.pendingDelete.set(null);

    this.deletingIds.update((current) => new Set(current).add(shipment.id));
    this.shipmentsApi
      .remove(shipment.id)
      .pipe(
        finalize(() => {
          this.deletingIds.update((current) => {
            const next = new Set(current);
            next.delete(shipment.id);
            return next;
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () =>
          this.shipments.update((rows) => rows.filter((row) => row.id !== shipment.id)),
        error: () => this.errorMessage.set('מחיקת התיק נכשלה'),
      });
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
