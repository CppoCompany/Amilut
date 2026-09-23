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

import { ImportFilesApi } from '../../../../api/import-files-api';
import type { UploadedImportFileDto } from '../../../../api/models';

interface ShipmentDocument {
  name: string;
  date: string;
  size: string;
}

const UPLOAD_FAILED = 'העלאת הקבצים נכשלה';

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
   * `order_account` id and names the folder on the server. Still the mock
   * value shown in the header until the screen is wired to a selected case.
   */
  protected readonly accountNumber = signal(1000);

  protected readonly uploading = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly documents = signal<ShipmentDocument[]>([
    { name: 'שטר מטען- מאסטרpdf', date: '18/05/2025', size: '1.2 MB' },
    { name: 'שטר מטען- פנימי', date: '18/05/2025', size: '1.2 MB' },
    { name: 'חשבון ספק.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'מפרט אריזות.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'תעודת שוק/תעודת מקור.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'הצעת מחיר ללקוח.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'חשבון מטענים.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'אישורים.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'רישיונות.pdf', date: '17/05/2025', size: '850 KB' },
    { name: 'ניירת כללית.pdf', date: '17/05/2025', size: '850 KB' },
  ]);

  /** "העלה קבצים" → opens the native multi-file picker. */
  protected openFilePicker(): void {
    if (this.uploading()) return;
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
    this.uploading.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    this.importFilesApi
      .uploadMultipleImportFiles(this.accountNumber(), files)
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
}

function toShipmentDocument(file: UploadedImportFileDto): ShipmentDocument {
  return {
    name: file.name,
    date: formatDocumentDate(file.uploadedAt),
    size: formatFileSize(file.size),
  };
}

/** `dd/MM/yyyy`, matching the existing rows in the documents table. */
export function formatDocumentDate(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** `850 KB` / `1.2 MB`, matching the existing rows in the documents table. */
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
