import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { ContextItem } from '../../active-context.model';

/**
 * Modal shown when closing a dirty context-bar item. Emits exactly one of
 * `save` / `discard` / `cancel` — never closes anything itself, the caller
 * (ContextBar) decides what each choice means.
 */
@Component({
  selector: 'app-unsaved-changes-dialog',
  templateUrl: './unsaved-changes-dialog.html',
  styleUrl: './unsaved-changes-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onCancel()',
  },
})
export class UnsavedChangesDialog {
  readonly item = input.required<ContextItem>();

  readonly save = output<void>();
  readonly discard = output<void>();
  readonly cancel = output<void>();

  protected onSave(): void {
    this.save.emit();
  }

  protected onDiscard(): void {
    this.discard.emit();
  }

  protected onCancel(): void {
    this.cancel.emit();
  }

  /** Only clicks on the backdrop itself (not inside the card) cancel. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }
}
