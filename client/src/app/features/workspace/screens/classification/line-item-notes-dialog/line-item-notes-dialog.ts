import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Message } from 'primeng/message';
import { Textarea } from 'primeng/textarea';
import { finalize } from 'rxjs';

import type { FilingContext } from '../../../../../api/filing-context.model';
import { ImportFilesApi } from '../../../../../api/import-files-api';
import type { LineItemNoteDto } from '../../../../../api/models';

/** Upper bound the server enforces on one note (`CreateLineItemNoteDto.body`). */
export const LINE_ITEM_NOTE_MAX_LENGTH = 2000;

/**
 * Notes popup of one classification-table row: the notes already written
 * against the line, oldest first, and a field to add another. A new note is
 * saved straight away and handed back through `added`.
 */
@Component({
  selector: 'app-line-item-notes-dialog',
  imports: [FormsModule, DatePipe, Button, Dialog, Message, Textarea],
  templateUrl: './line-item-notes-dialog.html',
  styleUrl: './line-item-notes-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineItemNotesDialog {
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly context = input.required<FilingContext>();
  readonly fileId = input.required<number>();
  readonly lineIndex = input.required<number>();
  /** Shown in the title so the user knows which row the notes belong to. */
  readonly sku = input('');
  readonly notes = input<readonly LineItemNoteDto[]>([]);

  readonly added = output<LineItemNoteDto>();
  readonly closed = output<void>();

  protected readonly maxLength = LINE_ITEM_NOTE_MAX_LENGTH;
  protected readonly draft = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected onSubmit(): void {
    const body = this.draft().trim();
    if (body === '' || this.saving()) return;

    this.saving.set(true);
    this.saveError.set(null);
    this.importFilesApi
      .addLineItemNote(this.context(), { fileId: this.fileId(), lineIndex: this.lineIndex(), body })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (note) => {
          this.draft.set('');
          this.added.emit(note);
        },
        error: () => this.saveError.set('שמירת ההערה נכשלה'),
      });
  }

  protected onHide(): void {
    this.closed.emit();
  }
}
