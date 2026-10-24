import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Button } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Table, TableModule } from 'primeng/table';
import { finalize } from 'rxjs';

import { CcfApi } from '../../../../api/ccf-api';
import { CCF_IMPORT_DOCUMENT_TYPES, CCF_STATUS_LABELS } from '../../../../api/enums';
import type { FilingContext } from '../../../../api/filing-context.model';
import type { CcfDto } from '../../../../api/models';
import { formatHeDate } from '../../../../shared/format';
import { StatusTag } from '../../../../shared/status-tag/status-tag';
import { SortAccessors, TableSort } from '../../../../shared/table-sort/table-sort';
import { ToastService } from '../../../../shared/toast/toast.service';
import { TypedRow } from '../../../../shared/typed-row/typed-row';
import { ImportFilesPanel } from '../../import-files-panel/import-files-panel';
import { NavigationService } from '../../navigation.service';

/** The server's page-size ceiling — one batch, filtered/sorted in memory. */
const MAX_CCFS = 200;

const CREATE_FAILED = 'יצירת תיק העמילות נכשלה';
const LOAD_FAILED = 'טעינת תיק העמילות נכשלה';
const LIST_FAILED = 'טעינת רשימת תיקי העמילות נכשלה';

function errorSuffix(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: string | string[] } | string | null | undefined;
    const message =
      typeof body === 'string'
        ? body
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : body?.message;
    if (message) {
      return `: ${message}`;
    }
  }
  return '';
}

/**
 * "תיקי עמילות" — the Customs Clearance Files list on the left and the
 * selected CCF's paperwork (upload + documents) on the right, via the
 * import-files panel's `split` layout. "תיק עמילות חדש" opens a standalone
 * CCF (`POST /api/ccf`) and selects it, so its paperwork can be filed at once.
 */
@Component({
  selector: 'app-ccf-screen',
  imports: [
    Button,
    IconField,
    InputIcon,
    InputText,
    Message,
    TableModule,
    ImportFilesPanel,
    StatusTag,
    TableSort,
    TypedRow,
  ],
  templateUrl: './ccf.html',
  styleUrl: './ccf.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcfScreen {
  private readonly ccfApi = inject(CcfApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);
  private readonly toast = inject(ToastService);
  private readonly ccfsTable = viewChild<Table>('ccfsTable');
  /** Set by a row click: that row is on screen already, so no scroll to it. */
  private skipNextScroll = false;

  protected readonly statusLabels = CCF_STATUS_LABELS;
  protected readonly ccfDocumentTypes = CCF_IMPORT_DOCUMENT_TYPES;
  protected readonly formatDate = formatHeDate;
  /** "סטטוס" sorts by its Hebrew label, as shown (`appTableSort`). */
  protected readonly ccfSort: SortAccessors<CcfDto> = {
    status: (ccf) => CCF_STATUS_LABELS[ccf.status],
    billNumber: (ccf) => this.billNumber(ccf),
  };
  protected readonly trackById = (_: number, row: { id: number }): number => row.id;

  protected readonly ccfs = signal<CcfDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly creating = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly selectedId = signal<number | null>(null);

  protected readonly selectedCcf = computed<CcfDto | null>(
    () => this.ccfs().find((ccf) => ccf.id === this.selectedId()) ?? null,
  );

  /** Drives the documents panel — `null` until a CCF is picked. */
  protected readonly ccfContext = computed<FilingContext | null>(() => {
    const ccf = this.selectedCcf();
    return ccf ? { kind: 'ccf', id: ccf.id } : null;
  });

  constructor() {
    this.loadCcfs();

    // The shipping-case wizard's "מעבר לתיק הסליקה" link navigates to
    // /workspace/ccf?ccfId=N, which NavigationService.applyUrl turns into
    // `viewCcfId` before this screen shows. Consume it once, same
    // effect+untracked shape as every other hand-off in this app — an effect
    // rather than a one-shot constructor read so Back/Forward landing on the
    // same URL while this instance is already mounted still works.
    effect(() => {
      const ccfId = this.nav.viewCcfId();
      if (ccfId === null) return;
      untracked(() => {
        this.nav.viewCcfId.set(null);
        this.selectedId.set(ccfId);
        if (!this.loading() && !this.ccfs().some((ccf) => ccf.id === ccfId)) {
          this.loadExisting(ccfId);
        }
      });
    });

    // Bring the selected row into view — on arrival from another screen it
    // may sit below the fold, and with virtual scrolling it is not even
    // rendered yet, so scroll to its index (in the table's filtered + sorted
    // order, as shown).
    afterRenderEffect(() => {
      const id = this.selectedId();
      this.ccfs();
      untracked(() => {
        if (this.skipNextScroll) {
          this.skipNextScroll = false;
          return;
        }
        const table = this.ccfsTable();
        if (id === null || !table) return;
        const shown = (table.filteredValue ?? table.value ?? []) as CcfDto[];
        const index = shown.findIndex((row) => row.id === id);
        if (index >= 0) table.scrollToVirtualIndex(index);
      });
    });
  }

  protected select(id: number): void {
    if (this.selectedId() === id) return;
    this.skipNextScroll = true;
    this.selectedId.set(id);
  }

  /** The CCF's bill: its sea MBL, or its air HAWB. */
  protected billNumber(ccf: CcfDto): string | null {
    return ccf.shipmentFileMblNumber ?? ccf.hblNumber;
  }

  /** "תיק עמילות חדש" — creates a standalone CCF, lists it first and selects it. */
  protected onCreate(): void {
    if (this.creating()) return;
    this.creating.set(true);
    this.errorMessage.set(null);
    this.ccfApi
      .create({})
      .pipe(
        finalize(() => this.creating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (ccf) => {
          this.ccfs.update((list) => [ccf, ...list.filter((row) => row.id !== ccf.id)]);
          this.selectedId.set(ccf.id);
          this.toast.success(`תיק עמילות ${ccf.fileNumber} נוצר`);
        },
        error: (error: unknown) => this.errorMessage.set(`${CREATE_FAILED}${errorSuffix(error)}`),
      });
  }

  private loadCcfs(): void {
    this.loading.set(true);
    this.ccfApi
      .list({ limit: MAX_CCFS })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (ccfs) => {
          this.ccfs.set(ccfs);
          // A hand-off for a CCF outside the newest batch: fetch it on its own.
          const id = this.selectedId();
          if (id !== null && !ccfs.some((ccf) => ccf.id === id)) {
            this.loadExisting(id);
          }
        },
        error: () => this.errorMessage.set(LIST_FAILED),
      });
  }

  private loadExisting(id: number): void {
    this.ccfApi
      .getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ccf) =>
          this.ccfs.update((list) => [ccf, ...list.filter((row) => row.id !== ccf.id)]),
        error: (error: unknown) => {
          if (this.selectedId() === id) this.selectedId.set(null);
          this.errorMessage.set(`${LOAD_FAILED}${errorSuffix(error)}`);
        },
      });
  }
}
