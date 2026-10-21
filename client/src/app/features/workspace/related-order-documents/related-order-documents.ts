import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Message } from 'primeng/message';
import { catchError, distinctUntilChanged, finalize, forkJoin, map, of, switchMap } from 'rxjs';

import { ORDER_IMPORT_DOCUMENT_TYPES, ORDER_REQUIRED_DOCUMENT_TYPES } from '../../../api/enums';
import { ImportFilesApi } from '../../../api/import-files-api';
import type { UploadedImportFileDto } from '../../../api/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import {
  DocumentStagingList,
  type StagedFiles,
} from '../document-staging-list/document-staging-list';
import { BLOB_URL_TTL_MS } from '../import-files-panel/import-files-panel';

/** Files picked per order but not uploaded yet — the parent uploads them on save. */
export type StagedFilesByOrder = Readonly<Record<number, StagedFiles>>;

/** One order's section — its stored files, or the fact that loading them failed. */
interface OrderDocuments {
  orderId: number;
  uploaded: UploadedImportFileDto[];
  error: boolean;
}

const NO_STAGED_FILES: StagedFiles = {};

/**
 * The order screen's "מסמכים" UI (`DocumentStagingList` — one row per
 * document type, upload/drop, stored files openable) once per order in
 * `orderIds`. Used by the CCF screen for the orders of the shipping case it
 * is being linked to. Never uploads itself: files picked here land in
 * `staged`, keyed by order id, and the parent uploads them on save.
 */
@Component({
  selector: 'app-related-order-documents',
  imports: [Message, DocumentStagingList, ConfirmDialog],
  templateUrl: './related-order-documents.html',
  styleUrl: './related-order-documents.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelatedOrderDocuments {
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly orderIds = input.required<readonly number[]>();
  /** Staged files per order — two-way bound so the parent owns them for upload. */
  readonly staged = model<StagedFilesByOrder>({});
  readonly bannerText = input('הקבצים יועלו לשרת לאחר השמירה');

  protected readonly documentTypes = ORDER_IMPORT_DOCUMENT_TYPES;
  protected readonly requiredDocumentTypes = ORDER_REQUIRED_DOCUMENT_TYPES;

  protected readonly orders = signal<OrderDocuments[]>([]);
  protected readonly loading = signal(false);
  /** Row id of the file currently being fetched for viewing, if any. */
  protected readonly openingId = signal<number | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  /** The uploaded file awaiting delete confirmation; drives the confirm dialog. */
  protected readonly fileToDelete = signal<{ orderId: number; file: UploadedImportFileDto } | null>(
    null,
  );
  /** Row id of the file currently being deleted, if any. */
  protected readonly deletingId = signal<number | null>(null);

  constructor() {
    this.loadOnOrderIdsChange();
  }

  protected stagedFor(orderId: number): StagedFiles {
    return this.staged()[orderId] ?? NO_STAGED_FILES;
  }

  protected onStagedChange(orderId: number, files: StagedFiles): void {
    this.staged.update((byOrder) => ({ ...byOrder, [orderId]: files }));
  }

  /** X on an uploaded file → asks for confirmation first (see `confirmDelete`). */
  protected requestDelete(orderId: number, file: UploadedImportFileDto): void {
    if (this.deletingId() !== null) return;
    this.fileToDelete.set({ orderId, file });
  }

  /** Deletes the confirmed file from its order and drops it from that order's list. */
  protected confirmDelete(): void {
    const target = this.fileToDelete();
    this.fileToDelete.set(null);
    if (!target) return;
    const { orderId, file } = target;
    this.deletingId.set(file.id);
    this.errorMessage.set(null);

    this.importFilesApi
      .deleteImportFile({ kind: 'order', id: orderId }, file.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deletingId.set(null)),
      )
      .subscribe({
        next: () =>
          this.orders.update((orders) =>
            orders.map((order) =>
              order.orderId === orderId
                ? { ...order, uploaded: order.uploaded.filter((f) => f.id !== file.id) }
                : order,
            ),
          ),
        error: () => this.errorMessage.set(`מחיקת הקובץ "${file.name}" נכשלה`),
      });
  }

  /**
   * Opens a stored file in a new browser tab. The tab is opened synchronously
   * inside the click (so popup blockers allow it) and pointed at the file
   * once its bytes arrive through the authenticated HTTP client.
   */
  protected openDocument(orderId: number, file: UploadedImportFileDto): void {
    if (this.openingId() !== null) return;
    this.openingId.set(file.id);
    this.errorMessage.set(null);

    const viewer = window.open('', '_blank');

    this.importFilesApi
      .getImportFileBlob({ kind: 'order', id: orderId }, file.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.openingId.set(null)),
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          if (viewer && !viewer.closed) {
            viewer.location.href = url;
          } else {
            window.open(url, '_blank');
          }
          setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_TTL_MS);
        },
        error: () => {
          viewer?.close();
          this.errorMessage.set(`פתיחת הקובץ "${file.name}" נכשלה`);
        },
      });
  }

  /** Reloads every order's stored files whenever the set of orders changes.
   *  One order failing does not hide the others — its section shows the error. */
  private loadOnOrderIdsChange(): void {
    toObservable(this.orderIds)
      .pipe(
        distinctUntilChanged((a, b) => a.join(',') === b.join(',')),
        switchMap((orderIds) => {
          this.orders.set([]);
          this.errorMessage.set(null);
          if (orderIds.length === 0) return of<OrderDocuments[]>([]);

          this.loading.set(true);
          return forkJoin(
            orderIds.map((orderId) =>
              this.importFilesApi.listImportFiles({ kind: 'order', id: orderId }).pipe(
                map((uploaded) => ({ orderId, uploaded, error: false })),
                catchError(() => of({ orderId, uploaded: [], error: true })),
              ),
            ),
          ).pipe(finalize(() => this.loading.set(false)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((orders) => this.orders.set(orders));
  }
}
