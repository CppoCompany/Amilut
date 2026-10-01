import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import {
  IMPORT_DOCUMENT_TYPE_LABELS,
  IMPORT_DOCUMENT_TYPES,
  ImportDocumentType,
} from '../../../../api/enums';
import { ImportFilesApi } from '../../../../api/import-files-api';
import type { UploadedImportFileDto } from '../../../../api/models';
import { CURRENT_CASE_NUMBER } from '../../current-case';

/** One row of the documents table — a file stored on the server for the current case. */
interface ShipmentDocument {
  /** `import_account_files` row id; what the "open" action fetches. */
  id: number;
  name: string;
  date: string;
  size: string;
  /** Hebrew label of the paperwork kind. */
  documentType: string;
}

const UPLOAD_FAILED = 'העלאת הקבצים נכשלה';
const LOAD_FAILED = 'טעינת רשימת הקבצים נכשלה';

/**
 * How long the blob URL handed to the viewer tab stays valid. The tab loads it
 * within milliseconds; the delay only has to outlive a slow first paint.
 */
export const BLOB_URL_TTL_MS = 60_000;

/** "תיוק ניירת יבוא" — import paperwork filing view. */
@Component({
  selector: 'app-filing-screen',
  templateUrl: './filing.html',
  styleUrl: './filing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilingScreen {
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  /**
   * The case ("מספר תיק") the uploaded files are filed under — this is the
   * `order_account` id and names the folder on the server. Still the shared
   * placeholder shown in the header until the screen is wired to a selected case.
   */
  protected readonly accountNumber = signal(CURRENT_CASE_NUMBER);

  protected readonly documentTypes = IMPORT_DOCUMENT_TYPES;
  protected readonly documentTypeLabels = IMPORT_DOCUMENT_TYPE_LABELS;
  /** Kind of paperwork the next upload is filed as — the server requires it, so uploads are gated on it. */
  protected readonly documentType = signal<ImportDocumentType | null>(null);

  protected readonly uploading = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  /** Files already stored for the case, newest first — loaded on init, extended by uploads. */
  protected readonly documents = signal<ShipmentDocument[]>([]);
  protected readonly loading = signal(false);
  /** Row id of the file currently being fetched for viewing, if any. */
  protected readonly openingId = signal<number | null>(null);

  constructor() {
    this.loadDocuments();
  }

  protected onDocumentTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.documentType.set(isImportDocumentType(value) ? value : null);
  }

  /** "העלה קבצים" → opens the native multi-file picker (only once a document type is chosen). */
  protected openFilePicker(): void {
    if (this.uploading() || this.documentType() === null) return;
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
    const documentType = this.documentType();
    if (documentType === null) return;

    this.uploading.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    this.importFilesApi
      .uploadMultipleImportFiles(this.accountNumber(), documentType, files)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: (uploaded) => {
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
        error: (error: unknown) => this.errorMessage.set(uploadErrorMessage(error)),
      });
  }

  /**
   * "פתח" → shows the file in a new browser tab. The tab is opened
   * synchronously inside the click (so popup blockers allow it) and pointed at
   * the file once its bytes arrive through the authenticated HTTP client.
   */
  protected openDocument(doc: ShipmentDocument): void {
    if (this.openingId() !== null) return;
    this.openingId.set(doc.id);
    this.errorMessage.set(null);

    const viewer = window.open('', '_blank');

    this.importFilesApi
      .getImportFileBlob(this.accountNumber(), doc.id)
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

  /** Fills the documents table with the files already stored for the case. */
  private loadDocuments(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.importFilesApi
      .listImportFiles(this.accountNumber())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (files) => this.documents.set(files.map(toShipmentDocument)),
        error: () => {
          this.documents.set([]);
          this.errorMessage.set(LOAD_FAILED);
        },
      });
  }
}

function toShipmentDocument(file: UploadedImportFileDto): ShipmentDocument {
  return {
    id: file.id,
    name: file.name,
    date: formatDocumentDate(file.uploadedAt),
    size: formatFileSize(file.size),
    documentType: IMPORT_DOCUMENT_TYPE_LABELS[file.documentType],
  };
}

function isImportDocumentType(value: string): value is ImportDocumentType {
  return (IMPORT_DOCUMENT_TYPES as readonly string[]).includes(value);
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
