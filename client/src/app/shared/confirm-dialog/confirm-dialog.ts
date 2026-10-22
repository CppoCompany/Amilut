import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';

/**
 * Generic "are you sure?" modal on PrimeNG's dialog. Purely presentational:
 * emits `confirmed`/`cancelled` and never touches any data itself.
 *
 * Usage: `<app-confirm-dialog (confirmed)="..." (cancelled)="..." />`, shown
 * via `@if` on a signal the caller owns (see MyOrdersScreen for an example).
 * Escape, the close icon and a click on the mask all cancel.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [Dialog, Button],
  templateUrl: './confirm-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
}
