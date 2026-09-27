import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { ContextItem, ContextItemType } from '../../active-context.model';

/**
 * Modal shown when "Create New Order/File" is triggered while one of that
 * type is already open. Emits exactly one of `continueExisting` / `createNew`
 * / `cancel` — the caller (the create-new guard) decides what each means.
 */
@Component({
  selector: 'app-confirm-create-new-dialog',
  templateUrl: './confirm-create-new-dialog.html',
  styleUrl: './confirm-create-new-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onCancel()',
  },
})
export class ConfirmCreateNewDialog {
  readonly type = input.required<ContextItemType>();
  readonly existingItem = input.required<ContextItem>();

  readonly continueExisting = output<void>();
  readonly createNew = output<void>();
  readonly cancel = output<void>();

  private readonly typeLabel: Record<ContextItemType, string> = { order: 'הזמנה', file: 'תיק' };

  protected readonly title = computed(
    () => `כבר עובדים על ${this.typeLabel[this.type()]} #${this.existingItem().id}`,
  );

  protected onContinueExisting(): void {
    this.continueExisting.emit();
  }

  protected onCreateNew(): void {
    this.createNew.emit();
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
