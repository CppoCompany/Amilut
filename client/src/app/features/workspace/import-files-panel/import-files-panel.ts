import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { SortEvent } from 'primeng/api';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tooltip } from 'primeng/tooltip';
import { catchError, EMPTY, finalize, map, of, switchMap } from 'rxjs';

import {
  IMPORT_DOCUMENT_TYPE_LABELS,
  IMPORT_DOCUMENT_TYPES,
  ImportDocumentType,
} from '../../../api/enums';
import type { FilingContext } from '../../../api/filing-context.model';
import { ImportFilesApi } from '../../../api/import-files-api';
import type { UploadedImportFileDto } from '../../../api/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { compareSortKeys, TableSort, toSortKey } from '../../../shared/table-sort/table-sort';
import { TypedRow } from '../../../shared/typed-row/typed-row';

/** One row of a category's documents list — a file stored on the server for
 *  the current context. */
interface ShipmentDocument {
  /** `import_account_files` row id; what the "open" action fetches. */
  id: number;
  name: string;
  date: string;
  size: string;
  /** Raw upload time (ISO) and byte count — the "תאריך" / "גודל" columns sort on these. */
  uploadedAt: string;
  bytes: number;
  /** Raw kind of paperwork — drives grouping; labels come from `documentTypeLabels`. */
  documentType: ImportDocumentType;
}

/** One category section — a document type plus the files filed under it. */
interface DocumentCategory {
  type: ImportDocumentType;
  label: string;
  docs: ShipmentDocument[];
}

/** One row of the `split` layout's single, virtual-scrolled documents table:
 *  a category's caption, its "none uploaded" line, or one of its files. */
type DocumentListRow =
  | { kind: 'category'; key: string; label: string; count: number }
  | { kind: 'empty'; key: string }
  | { kind: 'doc'; key: string; doc: ShipmentDocument };

/** Sortable columns of the documents table. */
type DocumentSortField = 'name' | 'uploadedAt' | 'bytes';

const UPLOAD_FAILED = 'העלאת הקבצים נכשלה';
const LOAD_FAILED = 'טעינת רשימת הקבצים נכשלה';

/**
 * How long the blob URL handed to the viewer tab stays valid. The tab loads it
 * within milliseconds; the delay only has to outlive a slow first paint.
 */
export const BLOB_URL_TTL_MS = 60_000;

/**
 * How the panel arranges itself: `stacked` (upload above the documents — the
 * CCF screen) or `split` (upload on the right, the projected record list and
 * the selected record's documents on the left — the Filing screen).
 */
export type ImportFilesPanelLayout = 'stacked' | 'split';

/**
 * The upload + documents-table UI shared by the Filing screen (beside its
 * Order/CCF tables) and the CCF screen (inline, scoped to the CCF just
 * saved). Extracted out of `FilingScreen` so the exact same upload/list/
 * open-in-tab logic isn't duplicated between the two.
 */
@Component({
  selector: 'app-import-files-panel',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    Button,
    Message,
    Select,
    TableModule,
    Tooltip,
    ConfirmDialog,
    TableSort,
    TypedRow,
  ],
  templateUrl: './import-files-panel.html',
  styleUrl: './import-files-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.import-files-panel--split]': "layout() === 'split'" },
})
export class ImportFilesPanel {
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  /** The Order or CCF the uploaded files are filed under. `null` until one
   *  is picked/known, and nothing is loaded or uploaded while it is. */
  readonly context = input<FilingContext | null>(null);
  /** Which document types the dropdown offers — the full set by default; the
   *  CCF screen passes a restricted 4-option subset. */
  readonly documentTypes = input<readonly ImportDocumentType[]>(IMPORT_DOCUMENT_TYPES);
  readonly layout = input<ImportFilesPanelLayout>('stacked');
  /** Shown in place of the documents while no context is set. */
  readonly emptyHint = input('בחר הזמנה או תיק עמילות כדי להציג את הקבצים שלו');
  /** The selected record's display name (e.g. its file number), appended to
   *  the `split` layout's "מסמכים" heading so it is clear whose files these are. */
  readonly contextLabel = input<string | null>(null);

  protected readonly documentTypeLabels = IMPORT_DOCUMENT_TYPE_LABELS;
  /** Kind of paperwork the next upload is filed as — the server requires it, so uploads are gated on it. */
  protected readonly documentType = signal<ImportDocumentType | null>(null);

  protected readonly uploading = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  /** Files already stored for the context, newest first — loaded when the context changes, extended by uploads. */
  protected readonly documents = signal<ShipmentDocument[]>([]);
  protected readonly loading = signal(false);
  /** Row id of the file currently being fetched for viewing, if any. */
  protected readonly openingId = signal<number | null>(null);
  /** The file awaiting delete confirmation; drives the confirm dialog. */
  protected readonly docToDelete = signal<ShipmentDocument | null>(null);
  /** Row id of the file currently being deleted, if any. */
  protected readonly deletingId = signal<number | null>(null);

  /** The "סוג מסמך" select's choices, in `documentTypes()` order. */
  protected readonly documentTypeOptions = computed(() =>
    this.documentTypes().map((type) => ({ value: type, label: this.documentTypeLabels[type] })),
  );

  /** `documents()` grouped into one section per offered type (in
   *  `documentTypes()`'s order — Bill of Lading / Supplier Invoice / Packing
   *  List / Additional Documents for the CCF screen), so "organized by
   *  category" holds regardless of which file happened to upload first. */
  protected readonly documentsByType = computed<DocumentCategory[]>(() => {
    const byType = new Map<ImportDocumentType, ShipmentDocument[]>();
    for (const doc of this.documents()) {
      const list = byType.get(doc.documentType);
      if (list) {
        list.push(doc);
      } else {
        byType.set(doc.documentType, [doc]);
      }
    }
    return this.documentTypes().map((type) => ({
      type,
      label: this.documentTypeLabels[type],
      docs: byType.get(type) ?? [],
    }));
  });

  /** The `split` documents table's sort, applied within each category. */
  protected readonly documentSort = signal<{ field: DocumentSortField; order: 1 | -1 } | null>(null);

  /**
   * `documentsByType()` flattened for the `split` layout's one table, so the
   * whole list virtual-scrolls instead of one table per category. Rows keep a
   * single height (`virtualScrollItemSize`), captions included.
   */
  protected readonly documentRows = computed<DocumentListRow[]>(() => {
    const sort = this.documentSort();
    return this.documentsByType().flatMap((category): DocumentListRow[] => {
      const caption: DocumentListRow = {
        kind: 'category',
        key: `category-${category.type}`,
        label: category.label,
        count: category.docs.length,
      };
      if (category.docs.length === 0) return [caption, { kind: 'empty', key: `empty-${category.type}` }];
      const docs = sort
        ? [...category.docs].sort((a, b) =>
            compareSortKeys(toSortKey(a[sort.field]), toSortKey(b[sort.field]), sort.order),
          )
        : category.docs;
      return [caption, ...docs.map((doc): DocumentListRow => ({ kind: 'doc', key: `doc-${doc.id}`, doc }))];
    });
  });

  protected readonly trackDocumentRow = (_: number, row: DocumentListRow): string => row.key;

  constructor() {
    this.loadDocumentsOnContextChange();
  }

  protected onDocumentTypeChange(value: string | null | undefined): void {
    this.documentType.set(value && this.isOfferedDocumentType(value) ? value : null);
  }

  /** "העלה קבצים" → opens the native multi-file picker (only once a context and a document type are chosen). */
  protected openFilePicker(): void {
    if (this.uploading() || this.context() === null || this.documentType() === null) return;
    this.fileInput().nativeElement.click();
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Reset so picking the same files again still fires `change`.
    input.value = '';
    if (files.length === 0) return;
    this.uploadMultipleImportFiles(files);
  }

  /** Sends `files` to the server and prepends the stored files to the documents table. */
  protected uploadMultipleImportFiles(files: File[]): void {
    const context = this.context();
    const documentType = this.documentType();
    if (context === null || documentType === null) return;

    this.uploading.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    this.importFilesApi
      .uploadMultipleImportFiles(context, documentType, files)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: (uploaded) => {
          // The files were stored, but another context was picked meanwhile — its table is not theirs.
          if (!sameContext(this.context(), context)) return;
          const fresh = uploaded.map(toShipmentDocument);
          const freshNames = new Set(fresh.map((doc) => doc.name));
          // Same-name files were overwritten on the server, so replace their rows too.
          this.documents.update((docs) => [
            ...fresh,
            ...docs.filter((doc) => !freshNames.has(doc.name)),
          ]);
          this.successMessage.set(
            uploaded.length === 1 ? 'קובץ אחד הועלה בהצלחה' : `${uploaded.length} קבצים הועלו בהצלחה`,
          );
        },
        error: (error: unknown) => {
          if (!sameContext(this.context(), context)) return;
          this.errorMessage.set(uploadErrorMessage(error));
        },
      });
  }

  /**
   * "פתח" → shows the file in a new browser tab. The tab is opened
   * synchronously inside the click (so popup blockers allow it) and pointed at
   * the file once its bytes arrive through the authenticated HTTP client.
   */
  protected openDocument(doc: ShipmentDocument): void {
    const context = this.context();
    if (context === null || this.openingId() !== null) return;
    this.openingId.set(doc.id);
    this.errorMessage.set(null);

    const viewer = window.open('', '_blank');

    this.importFilesApi
      .getImportFileBlob(context, doc.id)
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
          this.errorMessage.set(`פתיחת הקובץ "${doc.name}" נכשלה`);
        },
      });
  }

  /** X → asks for confirmation first (see `confirmDelete`). */
  protected requestDelete(doc: ShipmentDocument): void {
    if (this.deletingId() !== null) return;
    this.docToDelete.set(doc);
  }

  /** Deletes the confirmed file on the server and drops its row. */
  protected confirmDelete(): void {
    const doc = this.docToDelete();
    const context = this.context();
    this.docToDelete.set(null);
    if (!doc || context === null) return;
    this.deletingId.set(doc.id);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    this.importFilesApi
      .deleteImportFile(context, doc.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deletingId.set(null)),
      )
      .subscribe({
        next: () => {
          if (!sameContext(this.context(), context)) return;
          this.documents.update((docs) => docs.filter((d) => d.id !== doc.id));
        },
        error: () => {
          if (!sameContext(this.context(), context)) return;
          this.errorMessage.set(`מחיקת הקובץ "${doc.name}" נכשלה`);
        },
      });
  }

  /**
   * The `split` table's header sort (`customSort`): `appTableSort` would sort
   * the captions in with the files, so files are sorted within their category
   * instead. PrimeNG re-emits this whenever the value changes — the guard
   * keeps that from looping.
   */
  protected onDocumentsSort(event: SortEvent): void {
    const field = event.field as DocumentSortField | undefined;
    if (!field) return;
    const order = event.order === -1 ? -1 : 1;
    const current = this.documentSort();
    if (current?.field === field && current.order === order) return;
    this.documentSort.set({ field, order });
  }

  private isOfferedDocumentType(value: string): value is ImportDocumentType {
    return (this.documentTypes() as readonly string[]).includes(value);
  }

  /**
   * Fills the documents table with the files already stored for the current
   * context, again whenever the context changes. With no context the table
   * is simply empty — nothing is requested, so nothing can fail.
   */
  private loadDocumentsOnContextChange(): void {
    toObservable(this.context)
      .pipe(
        switchMap((context) => {
          this.documents.set([]);
          this.successMessage.set(null);
          this.errorMessage.set(null);
          if (context === null) return EMPTY;

          this.loading.set(true);
          return this.importFilesApi.listImportFiles(context).pipe(
            map((files) => files.map(toShipmentDocument)),
            catchError(() => {
              this.errorMessage.set(LOAD_FAILED);
              return of<ShipmentDocument[]>([]);
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((documents) => this.documents.set(documents));
  }
}

function sameContext(a: FilingContext | null, b: FilingContext | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

function toShipmentDocument(file: UploadedImportFileDto): ShipmentDocument {
  return {
    id: file.id,
    name: file.name,
    date: formatDocumentDate(file.uploadedAt),
    size: formatFileSize(file.size),
    uploadedAt: file.uploadedAt,
    bytes: file.size,
    documentType: file.documentType,
  };
}

/** `dd/MM/yyyy`, in the browser's local time. */
export function formatDocumentDate(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** `850 KB` / `1.2 MB`. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Hebrew error line for a failed upload, with the server's message appended when present. */
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return `${UPLOAD_FAILED}: השרת אינו זמין`;
    if (error.status === 413) return `${UPLOAD_FAILED}: קובץ גדול מדי`;
    const message = (error.error as { message?: string | string[] } | null)?.message;
    const text = Array.isArray(message) ? message.join(', ') : message;
    if (text) return `${UPLOAD_FAILED}: ${text}`;
  }
  return UPLOAD_FAILED;
}
