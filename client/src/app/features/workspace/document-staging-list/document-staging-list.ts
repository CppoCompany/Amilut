import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';

import { IMPORT_DOCUMENT_TYPE_LABELS, ImportDocumentType } from '../../../api/enums';
import type { UploadedImportFileDto } from '../../../api/models';

/** Files picked per document type but not uploaded yet — there may be no
 *  Order/CCF id to file them under until the parent saves. */
export type StagedFiles = Partial<Record<ImportDocumentType, File[]>>;

/** Font Awesome icon per document row. */
const DOCUMENT_ICONS: Partial<Record<ImportDocumentType, string>> = {
  [ImportDocumentType.BILL_OF_LADING]: 'fa-ship',
  [ImportDocumentType.SUPPLIER_INVOICE]: 'fa-file-invoice-dollar',
  [ImportDocumentType.PACKING_LIST]: 'fa-boxes-stacked',
  [ImportDocumentType.OTHER]: 'fa-folder-open',
};

/** The required types that have neither a staged nor an uploaded file. */
export function missingRequiredTypes(
  required: ReadonlySet<ImportDocumentType>,
  staged: StagedFiles,
  uploaded: readonly UploadedImportFileDto[],
): ImportDocumentType[] {
  return [...required].filter(
    (type) =>
      (staged[type]?.length ?? 0) === 0 && !uploaded.some((file) => file.documentType === type),
  );
}

/**
 * One row per document type — icon, name, required mark, file-count badge,
 * upload button and drop zone — with the picked files listed under each row.
 * Purely a staging UI: it never uploads; the parent screen (CCF, Order)
 * uploads `files()` once it has an id to file them under. Files already on
 * the server can be passed in `uploaded` and are listed read-only.
 */
@Component({
  selector: 'app-document-staging-list',
  imports: [Button, Message, Tag, Tooltip],
  templateUrl: './document-staging-list.html',
  styleUrl: './document-staging-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentStagingList {
  readonly documentTypes = input.required<readonly ImportDocumentType[]>();
  readonly requiredTypes = input<ReadonlySet<ImportDocumentType>>(new Set());
  /** Staged files per type — two-way bound so the parent owns them for upload. */
  readonly files = model.required<StagedFiles>();
  /** Files already stored on the server for this Order/CCF. */
  readonly uploaded = input<readonly UploadedImportFileDto[]>([]);
  readonly bannerText = input('הקבצים יועלו לשרת לאחר השמירה');
  /** Marks required rows that are still empty (e.g. after a blocked "סיום"). */
  readonly showMissing = input(false);
  /** Row id of an uploaded file currently being opened, for its spinner. */
  readonly openingId = input<number | null>(null);
  readonly openUploaded = output<UploadedImportFileDto>();
  /** Shows an X on each uploaded file; the parent confirms and deletes it. */
  readonly deletable = input(false);
  /** Row id of an uploaded file currently being deleted, for its spinner. */
  readonly deletingId = input<number | null>(null);
  readonly deleteUploaded = output<UploadedImportFileDto>();

  protected readonly documentTypeLabels = IMPORT_DOCUMENT_TYPE_LABELS;
  protected readonly documentIcons = DOCUMENT_ICONS;

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly pendingType = signal<ImportDocumentType | null>(null);
  /** The row a drag is currently hovering, for the drop highlight. */
  protected readonly dragOverType = signal<ImportDocumentType | null>(null);

  protected readonly uploadedByType = computed(() => {
    const byType = new Map<ImportDocumentType, UploadedImportFileDto[]>();
    for (const file of this.uploaded()) {
      byType.set(file.documentType, [...(byType.get(file.documentType) ?? []), file]);
    }
    return byType;
  });

  protected readonly missing = computed(
    () => new Set(missingRequiredTypes(this.requiredTypes(), this.files(), this.uploaded())),
  );

  protected stagedFor(type: ImportDocumentType): readonly File[] {
    return this.files()[type] ?? [];
  }

  protected uploadedFor(type: ImportDocumentType): readonly UploadedImportFileDto[] {
    return this.uploadedByType().get(type) ?? [];
  }

  protected countLabel(count: number): string {
    return count === 1 ? 'קובץ אחד' : `${count} קבצים`;
  }

  /** "העלאה" on a row — opens the native picker for that document type. */
  protected openPicker(type: ImportDocumentType): void {
    this.pendingType.set(type);
    this.fileInput().nativeElement.click();
  }

  protected onFilesSelected(event: Event): void {
    const type = this.pendingType();
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Reset so picking the same files again still fires `change`.
    input.value = '';
    this.pendingType.set(null);
    if (type === null) return;
    this.add(type, files);
  }

  protected onDragOver(event: DragEvent, type: ImportDocumentType): void {
    event.preventDefault(); // required for `drop` to fire
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragOverType.set(type);
  }

  protected onDragLeave(type: ImportDocumentType): void {
    if (this.dragOverType() === type) this.dragOverType.set(null);
  }

  /** Dropping files on a row stages them exactly like the picker does. */
  protected onDrop(event: DragEvent, type: ImportDocumentType): void {
    event.preventDefault();
    this.dragOverType.set(null);
    this.add(type, Array.from(event.dataTransfer?.files ?? []));
  }

  protected remove(type: ImportDocumentType, index: number): void {
    this.files.update((staged) => ({
      ...staged,
      [type]: (staged[type] ?? []).filter((_, i) => i !== index),
    }));
  }

  private add(type: ImportDocumentType, files: File[]): void {
    if (files.length === 0) return;
    this.files.update((staged) => ({
      ...staged,
      [type]: [...(staged[type] ?? []), ...files],
    }));
  }
}
