import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  description?: string;
  /** Auto-dismiss after this many ms. `0` keeps the toast until closed. */
  duration?: number;
}

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 6000;

/**
 * The app's one message queue. Root-provided so any component (and any
 * spec) can raise a toast without extra setup; the workspace shell aliases
 * PrimeNG's `MessageService` to it so its `<p-toast>` renders this queue.
 */
@Injectable({ providedIn: 'root' })
export class AppMessageService extends MessageService {}

const SEVERITY: Record<ToastType, 'success' | 'error' | 'info'> = {
  success: 'success',
  error: 'error',
  info: 'info',
};

/**
 * Non-blocking notifications. Call `success()` / `error()` / `info()` from
 * anywhere; the `<p-toast>` mounted in the workspace shell renders them
 * (PrimeNG pauses the timer while the pointer is over a message).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messages = inject(AppMessageService);

  success(title: string, options: ToastOptions = {}): void {
    this.show('success', title, options);
  }

  error(title: string, options: ToastOptions = {}): void {
    this.show('error', title, { duration: ERROR_DURATION, ...options });
  }

  info(title: string, options: ToastOptions = {}): void {
    this.show('info', title, options);
  }

  show(type: ToastType, title: string, options: ToastOptions = {}): void {
    const duration = options.duration ?? DEFAULT_DURATION;
    this.messages.add({
      severity: SEVERITY[type],
      summary: title,
      detail: options.description,
      life: duration > 0 ? duration : undefined,
      sticky: duration === 0,
    });
  }

  clear(): void {
    this.messages.clear();
  }
}
