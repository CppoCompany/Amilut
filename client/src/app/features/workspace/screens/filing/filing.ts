import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, finalize, map, of, switchMap } from 'rxjs';

import {
  IMPORT_DOCUMENT_TYPE_LABELS,
  IMPORT_DOCUMENT_TYPES,
  ImportDocumentType,
} from '../../../../api/enums';
import { ImportFilesApi } from '../../../../api/import-files-api';
import type { UploadedImportFileDto } from '../../../../api/models';
import { CasePicker } from '../../case-picker/case-picker';
import { CurrentCaseService } from '../../current-case.service';
import { NavigationService } from '../../navigation.service';

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
  imports: [CasePicker],
  templateUrl: './filing.html',
  styleUrl: './filing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilingScreen {
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavigationService);
  private readonly currentCase = inject(CurrentCaseService);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  /**
   * The case ("מספר תיק") the uploaded files are filed under — the `mbl` id
   * picked in the case picker; it names the folder on the server. `null`
   * until a case is picked, and nothing is loaded or uploaded while it is.
   */
  protected readonly accountNumber = this.currentCase.caseId;

  protected readonly documentTypes = IMPORT_DOCUMENT_TYPES;
  protected readonly documentTypeLabels = IMPORT_DOCUMENT_TYPE_LABELS;
  /** Kind of paperwork the next upload is filed as — the server requires it, so uploads are gated on it. */
  protected readonly documentType = signal<ImportDocumentType | null>(null);

  protected readonly uploading = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  /** Files already stored for the case, newest first — loaded when a case is picked, extended by uploads. */
  protected readonly documents = signal<ShipmentDocument[]>([]);
  protected readonly loading = signal(false);
  /** Row id of the file currently being fetched for viewing, if any. */
  protected readonly openingId = signal<number | null>(null);

  constructor() {
    this.loadDocumentsOnCaseChange();

    // The Order screen's "תיוק ניירת יבוא" button and "ייבוא מסמכים" in
    // "ההזמנות שלי" navigate to `/workspace/filing?caseId=N`, which
    // NavigationService.applyUrl turns into `filingCaseId` before this screen
    // shows. Consume it once as soon as it appears and preselect it in the
    // (shared) case picker. An effect rather than a one-shot constructor
    // read, same reasoning as the order screen's `editOrderId`: Back/Forward
    // can land on a filing URL while this instance is already mounted.
    effect(() => {
      const filingCaseId = this.nav.filingCaseId();
      if (filingCaseId === null) return;
      untracked(() => {
        this.nav.filingCaseId.set(null);
        this.currentCase.caseId.set(filingCaseId);
      });
    });
  }

  protected onDocumentTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.documentType.set(isImportDocumentType(value) ? value : null);
  }

  /** "העלה קבצים" → opens the native multi-file picker (only once a case and a document type are chosen). */
  protected openFilePicker(): void {
    if (this.uploading() || this.accountNumber() === null || this.documentType() === null) return;
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
    const accountNumber = this.accountNumber();
    const documentType = this.documentType();
    if (accountNumber === null || documentType === null) return;

    this.uploading.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    this.importFilesApi
      .uploadMultipleImportFiles(accountNumber, documentType, files)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: (uploaded) => {
          // The files were stored, but another case was picked meanwhile — its table is not theirs.
          if (this.accountNumber() !== accountNumber) return;
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
          if (this.accountNumber() !== accountNumber) return;
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
    const accountNumber = this.accountNumber();
    if (accountNumber === null || this.openingId() !== null) return;
    this.openingId.set(doc.id);
    this.errorMessage.set(null);

    const viewer = window.open('', '_blank');

    this.importFilesApi
      .getImportFileBlob(accountNumber, doc.id)
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

  /**
   * Fills the documents table with the files already stored for the picked
   * case, again whenever another case is picked. With no case picked the table
   * is simply empty — nothing is requested, so nothing can fail.
   */
  private loadDocumentsOnCaseChange(): void {
    toObservable(this.accountNumber)
      .pipe(
        switchMap((accountNumber) => {
          this.documents.set([]);
          this.successMessage.set(null);
          this.errorMessage.set(null);
          if (accountNumber === null) return EMPTY;

          this.loading.set(true);
          return this.importFilesApi.listImportFiles(accountNumber).pipe(
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
