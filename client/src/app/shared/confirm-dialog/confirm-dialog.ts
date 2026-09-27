import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Generic "are you sure?" modal — replaces native `confirm()` with a styled
 * dialog matching the app's existing modal shell. Purely presentational:
 * emits `confirmed`/`cancelled` and never touches any data itself.
 *
 * Usage: `<app-confirm-dialog (confirmed)="..." (cancelled)="..." />`, shown
 * via `@if` on a signal the caller owns (see MyOrdersScreen for an example).
 */
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onCancel()',
  },
})
export class ConfirmDialog {
  readonly message = input('האם אתה בטוח שברצונך למחוק?');
  readonly confirmLabel = input('מחק');
  readonly cancelLabel = input('ביטול');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected onConfirm(): void {
    this.confirmed.emit();
  }

  protected onCancel(): void {
    this.cancelled.emit();
  }

  /** Only clicks on the backdrop itself (not inside the card) cancel. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }
}
