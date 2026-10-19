import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';

import { CcfApi } from '../../../../api/ccf-api';
import {
  CCF_IMPORT_DOCUMENT_TYPES,
  CCF_STATUS_LABELS,
  ImportDocumentType,
} from '../../../../api/enums';
import type { FilingContext } from '../../../../api/filing-context.model';
import { ImportFilesApi } from '../../../../api/import-files-api';
import { MblApi } from '../../../../api/mbl-api';
import type { CcfDto, MblSummaryDto } from '../../../../api/models';
import {
  DocumentStagingList,
  type StagedFiles,
} from '../../document-staging-list/document-staging-list';
import { ImportFilesPanel } from '../../import-files-panel/import-files-panel';
import { NavigationService } from '../../navigation.service';
import {
  RelatedOrderDocuments,
  type StagedFilesByOrder,
} from '../../related-order-documents/related-order-documents';
import {
  SearchSelect,
  type SearchSelectOption,
} from '../../../../shared/search-select/search-select';

/** The server's page-size ceiling — same batch size the (retired) `CasePicker` used. */
const MAX_SHIPMENT_FILES = 200;

const SAVE_FAILED = 'שמירת תיק הסליקה נכשלה';
const LOAD_FAILED = 'טעינת תיק הסליקה נכשלה';
const UPLOAD_FAILED = 'התיק נשמר, אך העלאת חלק מהמסמכים נכשלה';

/** Marked with a required indicator — visual only, save is not blocked. */
const REQUIRED_DOCUMENT_TYPES: ReadonlySet<ImportDocumentType> = new Set([
  ImportDocumentType.BILL_OF_LADING,
  ImportDocumentType.SUPPLIER_INVOICE,
]);

function hasStagedFiles(staged: StagedFiles): boolean {
  return Object.values(staged).some((files) => files.length > 0);
}

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

/** "תיק עמילות" — opens a Customs Clearance File, optionally linked to an
 *  existing shipping case, wired to `POST/GET /api/ccf`. */
@Component({
  selector: 'app-ccf-screen',
  imports: [DocumentStagingList, ImportFilesPanel, RelatedOrderDocuments, SearchSelect],
  templateUrl: './ccf.html',
  styleUrl: './ccf.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcfScreen {
  private readonly ccfApi = inject(CcfApi);
  private readonly mblApi = inject(MblApi);
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);

  protected readonly statusLabels = CCF_STATUS_LABELS;
  protected readonly ccfDocumentTypes = CCF_IMPORT_DOCUMENT_TYPES;
  protected readonly requiredDocumentTypes = REQUIRED_DOCUMENT_TYPES;

  // ── Pre-save document staging ───────────────────────────────────────────────
  // Files picked for the four CCF document categories before the record
  // exists yet — there is no ccfId to file them under until `onSave` creates
  // one, so `DocumentStagingList` holds them here and they are uploaded right
  // after creation succeeds.
  protected readonly stagedFiles = signal<StagedFiles>({});
  /** Files picked for the linked shipping case's orders (keyed by order id),
   *  uploaded to those orders right after the CCF is created. */
  protected readonly stagedOrderFiles = signal<StagedFilesByOrder>({});

  // ── Shipment-file dropdown ──────────────────────────────────────────────────
  protected readonly shipmentFiles = signal<MblSummaryDto[]>([]);
  protected readonly loadingShipmentFiles = signal(false);
  protected readonly selectedShipmentFileId = signal<number | null>(null);

  /** The dropdown's rows — searchable by everything in the label (case id, MBL, customers). */
  protected readonly shipmentFileOptions = computed<SearchSelectOption<number>[]>(() =>
    this.shipmentFiles().map((file) => ({ value: file.id, label: this.shipmentFileLabel(file) })),
  );

  /** Orders of the selected shipping case — while set, their paperwork
   *  replaces the CCF's own "ניירת" card. `null` while no case is selected
   *  (or the selected one is not in the loaded list). */
  protected readonly relatedOrderIds = computed<readonly number[] | null>(() => {
    const id = this.selectedShipmentFileId();
    if (id === null) return null;
    return this.shipmentFiles().find((file) => file.id === id)?.orderIds ?? null;
  });

  // ── Save / load state ───────────────────────────────────────────────────────
  /** The CCF as last returned by the server; `null` until the first successful save. */
  protected readonly savedCcf = signal<CcfDto | null>(null);
  protected readonly saving = signal(false);
  /** True while an existing CCF is being fetched for viewing (see the constructor). */
  protected readonly loadingExisting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** Server preview of the number a new CCF will get (see `loadNextFileNumber`). */
  private readonly nextFileNumber = signal<string | null>(null);

  /** The saved CCF's number once it exists; before that, the server's preview
   *  of the next number (a concurrent create may still take it, in which case
   *  the save response's number replaces it). Empty while the preview loads. */
  protected readonly fileNumber = computed(
    () => this.savedCcf()?.fileNumber ?? this.nextFileNumber() ?? '',
  );

  /** Once a CCF exists (just created, or reloaded for viewing), its shipment-
   *  file link and file number are immutable — the DB enforces the 1:1 link
   *  at creation time, so there is nothing left to legally change here. */
  protected readonly isReadOnly = computed(() => this.savedCcf() !== null);

  /** Drives the inline `ImportFilesPanel` once this CCF exists — `null`
   *  before the first save, since there's nothing to file paperwork under yet. */
  protected readonly ccfContext = computed<FilingContext | null>(() => {
    const ccf = this.savedCcf();
    return ccf ? { kind: 'ccf', id: ccf.id } : null;
  });

  constructor() {
    this.loadShipmentFiles();
    this.loadNextFileNumber();

    // The shipping-case wizard's "מעבר לתיק הסליקה" link navigates to
    // /workspace/ccf?ccfId=N, which NavigationService.applyUrl turns into
    // `viewCcfId` before this screen shows. Consume it once, same
    // effect+untracked shape as every other hand-off in this app
    // (editOrderId/editCaseId/openFilingContext/openClassificationContext) —
    // an effect rather than a one-shot constructor read so Back/Forward
    // landing on the same URL while this instance is already mounted still
    // works.
    effect(() => {
      const ccfId = this.nav.viewCcfId();
      if (ccfId === null) return;
      untracked(() => {
        this.nav.viewCcfId.set(null);
        this.loadExisting(ccfId);
      });
    });
  }

  protected onShipmentFileChange(id: number | null): void {
    this.selectedShipmentFileId.set(id);
  }

  /** "תיק 7 · MBL-987654321 · ACME Ltd." */
  private shipmentFileLabel(mblCase: MblSummaryDto): string {
    return [`תיק ${mblCase.id}`, mblCase.mblNumber, mblCase.customerNames.join(', ')]
      .filter((part) => !!part)
      .join(' · ');
  }

  /** "ביטול" — clears the unsaved selections (same shape as `OrderScreen.onCancel`). */
  protected onCancel(): void {
    if (this.saving() || this.isReadOnly()) return;
    const hasInput =
      this.selectedShipmentFileId() !== null ||
      hasStagedFiles(this.stagedFiles()) ||
      Object.values(this.stagedOrderFiles()).some(hasStagedFiles);
    if (hasInput && !confirm('הפרטים שהוזנו יימחקו. לבטל בכל זאת?')) {
      return;
    }
    this.selectedShipmentFileId.set(null);
    this.stagedFiles.set({});
    this.stagedOrderFiles.set({});
    this.errorMessage.set(null);
  }

  /**
   * Creates the CCF. Guards against double-submit (`saving()`) and against
   * resubmitting an already-saved CCF (`isReadOnly()`) — the record is only
   * ever created here, never on page load, so a refresh cannot duplicate it
   * either. Then uploads the staged paperwork: to the linked shipping case's
   * orders when one is selected, otherwise to the CCF itself. On success: a
   * CCF linked to a shipping case auto-navigates to Classification (scoped
   * to this CCF's own id, not the shipment file's); a standalone CCF stays
   * right here — `ccfContext()` now resolves, so the inline upload panel
   * appears in place. Never navigates on failure (including a failed upload,
   * so its error stays visible), and nothing entered is cleared on a failed
   * create.
   */
  protected onSave(): void {
    if (this.saving() || this.isReadOnly()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);

    const shipmentFileId = this.selectedShipmentFileId();
    const orderIds = this.relatedOrderIds();
    this.ccfApi
      .create(shipmentFileId !== null ? { shipmentFileId } : {})
      .pipe(
        switchMap((ccf) => {
          const uploads =
            orderIds !== null
              ? orderIds.map((id) =>
                  this.uploadStagedFiles({ kind: 'order', id }, this.stagedOrderFiles()[id] ?? {}),
                )
              : [this.uploadStagedFiles({ kind: 'ccf', id: ccf.id }, this.stagedFiles())];
          return forkJoin(uploads).pipe(
            map((failed) => ({ ccf, uploadFailed: failed.some(Boolean) })),
          );
        }),
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ ccf, uploadFailed }) => {
          this.savedCcf.set(ccf);
          if (ccf.shipmentFileId !== null && !uploadFailed) {
            this.nav.openClassificationFor({ kind: 'ccf', id: ccf.id });
          }
        },
        error: (error: unknown) => this.errorMessage.set(`${SAVE_FAILED}${errorSuffix(error)}`),
      });
  }

  /**
   * Uploads whatever was staged per document type under `context` (the new
   * CCF, or one of the linked orders); emits `true` if an upload failed.
   * Upload failures are reported but never block the CCF itself from being
   * considered saved — the record already exists in the DB by this point.
   */
  private uploadStagedFiles(context: FilingContext, staged: StagedFiles): Observable<boolean> {
    const entries = Object.entries(staged) as [ImportDocumentType, File[]][];
    const nonEmpty = entries.filter(([, files]) => files.length > 0);
    if (nonEmpty.length === 0) {
      return of(false);
    }
    return forkJoin(
      nonEmpty.map(([type, files]) =>
        this.importFilesApi.uploadMultipleImportFiles(context, type, files),
      ),
    ).pipe(
      map(() => false),
      catchError((error: unknown) => {
        this.errorMessage.set(`${UPLOAD_FAILED}${errorSuffix(error)}`);
        return of(true);
      }),
    );
  }

  private loadShipmentFiles(): void {
    this.loadingShipmentFiles.set(true);
    this.mblApi
      .list({ limit: MAX_SHIPMENT_FILES })
      .pipe(
        finalize(() => this.loadingShipmentFiles.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (files) => this.shipmentFiles.set(files),
        error: () => this.errorMessage.set('טעינת רשימת תיקי השילוח נכשלה'),
      });
  }

  /** Best-effort: on failure the field just stays empty until save. */
  private loadNextFileNumber(): void {
    this.ccfApi
      .peekNextFileNumber()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ fileNumber }) => this.nextFileNumber.set(fileNumber),
        error: () => this.nextFileNumber.set(null),
      });
  }

  private loadExisting(id: number): void {
    this.loadingExisting.set(true);
    this.errorMessage.set(null);
    this.ccfApi
      .getById(id)
      .pipe(
        finalize(() => this.loadingExisting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (ccf) => {
          this.savedCcf.set(ccf);
          this.selectedShipmentFileId.set(ccf.shipmentFileId);
        },
        error: (error: unknown) => this.errorMessage.set(`${LOAD_FAILED}${errorSuffix(error)}`),
      });
  }
}
