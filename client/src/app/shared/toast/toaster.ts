import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from './toast.service';

/**
 * Renders the {@link ToastService} queue as a stack in the bottom-end corner
 * (bottom-left in RTL, clear of the sidebar). Mounted once in the workspace
 * shell. Enter: slide up on a spring; exit: quick fade. Hovering the stack or
 * hiding the tab pauses every timer.
 */
@Component({
  selector: 'app-toaster',
  templateUrl: './toaster.html',
  styleUrl: './toaster.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'region',
    'aria-label': 'הודעות מערכת',
    '(mouseenter)': 'toasts.pauseAll()',
    '(mouseleave)': 'toasts.resumeAll()',
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
})
export class Toaster {
  protected readonly toasts = inject(ToastService);

  protected iconFor(type: 'success' | 'error' | 'info'): string {
    switch (type) {
      case 'success':
        return 'fa-solid fa-circle-check';
      case 'error':
        return 'fa-solid fa-circle-exclamation';
      default:
        return 'fa-solid fa-circle-info';
    }
  }

  protected onVisibilityChange(): void {
    if (document.hidden) this.toasts.pauseAll();
    else this.toasts.resumeAll();
  }
}
