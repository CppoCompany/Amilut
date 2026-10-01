import { ScrollingModule } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { combineLatest, debounceTime, finalize, skip } from 'rxjs';

import { MBL_SHIPPING_TYPE_LABELS, SEA_METHOD_LABELS } from '../../../../api/enums';
import { ListMblParams, MblApi } from '../../../../api/mbl-api';
import type { CustomerDto, MblSummaryDto } from '../../../../api/models';
import { ConfirmDialog } from '../../../../shared/confirm-dialog/confirm-dialog';
import {
  CustomerAutocomplete,
  SEARCH_DEBOUNCE_MS,
} from '../../../customers/customer-autocomplete/customer-autocomplete';
import { NavigationService } from '../../navigation.service';

/** Single batch fetched per filter change; rendering beyond this is virtualized, not paginated. */
const MAX_ROWS = 200;

/** "התיקים שלי" — filterable grid over every MBL/HBL shipping case, virtual-scrolled. */
@Component({
  selector: 'app-my-files-screen',
  imports: [FormsModule, ScrollingModule, CustomerAutocomplete, ConfirmDialog],
  templateUrl: './my-files.html',
  styleUrl: './my-files.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyFilesScreen {
  private readonly mblApi = inject(MblApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);

  // ── Filters (live — debounced, no apply button) ────────────────────────────
  protected readonly filterCustomer = signal<CustomerDto | null>(null);
  protected readonly filterCarrierName = signal('');
  protected readonly filterCaseNumber = signal('');

  // ── Grid state ──────────────────────────────────────────────────────────────
  protected readonly cases = signal<MblSummaryDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  /** Case ids currently being deleted — disables their row's delete button mid-request. */
  protected readonly deletingIds = signal<ReadonlySet<number>>(new Set());
  /** The case awaiting delete confirmation in the modal, or `null`. */
  protected readonly pendingDelete = signal<MblSummaryDto | null>(null);

  constructor() {
    this.fetch();

    combineLatest([
      toObservable(this.filterCustomer),
      toObservable(this.filterCarrierName),
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
    this.filterCarrierName.set('');
    this.filterCaseNumber.set('');
  }

  /** Double-click a row to open it in the MBL/HBL shipping-case wizard for editing. */
  protected onEditCase(mblCase: MblSummaryDto): void {
    this.nav.openCaseForEdit(mblCase.id);
  }

  /** "ימי - FCL/FCL", "אווירי", etc. */
  protected methodLabel(mblCase: MblSummaryDto): string {
    const shippingLabel = MBL_SHIPPING_TYPE_LABELS[mblCase.shippingType];
    return mblCase.seaMethod ? `${shippingLabel} - ${SEA_METHOD_LABELS[mblCase.seaMethod]}` : shippingLabel;
  }

  protected joinOrEmDash(values: readonly (string | number)[]): string {
    return values.length ? values.join(', ') : '—';
  }

  protected isDeleting(caseId: number): boolean {
    return this.deletingIds().has(caseId);
  }

  /** Opens the confirm-delete modal for this row. */
  protected onDeleteCase(mblCase: MblSummaryDto, event: Event): void {
    event.stopPropagation();
    if (this.isDeleting(mblCase.id)) return;
    this.pendingDelete.set(mblCase);
  }

  protected cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /** Confirmed via the modal — deletes the MBL (cascading to its HBLs/containers)
   *  and removes its row from the grid. Its orders are freed back to unassigned
   *  automatically (server-side FK, `ON DELETE SET NULL`). */
  protected confirmDelete(): void {
    const mblCase = this.pendingDelete();
    if (!mblCase) return;
    this.pendingDelete.set(null);

    this.deletingIds.update((current) => new Set(current).add(mblCase.id));
    this.mblApi
      .remove(mblCase.id)
      .pipe(
        finalize(() => {
          this.deletingIds.update((current) => {
            const next = new Set(current);
            next.delete(mblCase.id);
            return next;
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.cases.update((rows) => rows.filter((row) => row.id !== mblCase.id)),
        error: () => this.errorMessage.set('מחיקת התיק נכשלה'),
      });
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  protected trackById(_index: number, mblCase: MblSummaryDto): number {
    return mblCase.id;
  }

  private fetch(): void {
    const params: ListMblParams = { limit: MAX_ROWS };

    const customerId = this.filterCustomer()?.id;
    if (customerId !== undefined) {
      params.customerId = customerId;
    }
    const carrierName = this.filterCarrierName().trim();
    if (carrierName) {
      params.carrierName = carrierName;
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
    this.mblApi
      .list(params)
      .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.cases.set(rows),
        error: () => {
          this.cases.set([]);
          this.errorMessage.set('טעינת התיקים נכשלה');
        },
      });
  }
}
