import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  readonly id: number;
  readonly type: ToastType;
  readonly title: string;
  readonly description: string | null;
  /** Set while the exit transition plays; the element is removed right after. */
  readonly leaving: boolean;
}

export interface ToastOptions {
  description?: string;
  /** Auto-dismiss after this many ms. `0` keeps the toast until closed. */
  duration?: number;
}

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 6000;
const EXIT_MS = 180;
const MAX_VISIBLE = 4;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

/**
 * Non-blocking notifications ("Sonner"-style). Call `success()` / `error()` /
 * `info()` from anywhere; the `Toaster` component mounted in the workspace
 * shell renders the queue. Timers pause while the pointer is over the stack
 * or the tab is hidden, so a toast is never missed because it expired
 * off-screen.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly timers = new Map<number, Timer>();
  private readonly _toasts = signal<Toast[]>([]);

  readonly toasts = this._toasts.asReadonly();

  success(title: string, options: ToastOptions = {}): number {
    return this.show('success', title, options);
  }

  error(title: string, options: ToastOptions = {}): number {
    return this.show('error', title, { duration: ERROR_DURATION, ...options });
  }

  info(title: string, options: ToastOptions = {}): number {
    return this.show('info', title, options);
  }

  show(type: ToastType, title: string, options: ToastOptions = {}): number {
    const id = this.nextId++;
    const toast: Toast = {
      id,
      type,
      title,
      description: options.description ?? null,
      leaving: false,
    };
    this._toasts.update((list) => {
      const next = [...list, toast];
      // Keep the stack short: the oldest goes away immediately, no exit animation.
      const overflow = next.filter((t) => !t.leaving).length - MAX_VISIBLE;
      if (overflow > 0) {
        const dropped = next.filter((t) => !t.leaving).slice(0, overflow);
        for (const d of dropped) this.clearTimer(d.id);
        return next.filter((t) => !dropped.includes(t));
      }
      return next;
    });
    const duration = options.duration ?? DEFAULT_DURATION;
    if (duration > 0) this.startTimer(id, duration);
    return id;
  }

  /** Starts the exit transition; the toast leaves the list once it is done. */
  dismiss(id: number): void {
    this.clearTimer(id);
    if (!this._toasts().some((t) => t.id === id && !t.leaving)) return;
    this._toasts.update((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => this.remove(id), EXIT_MS);
  }

  /** Freezes every auto-dismiss timer (pointer over the stack, tab hidden). */
  pauseAll(): void {
    const now = Date.now();
    for (const timer of this.timers.values()) {
      if (timer.handle === null) continue;
      clearTimeout(timer.handle);
      timer.handle = null;
      timer.remaining = Math.max(0, timer.remaining - (now - timer.startedAt));
    }
  }

  resumeAll(): void {
    for (const [id, timer] of this.timers) {
      if (timer.handle !== null) continue;
      // Give a toast that was about to expire a short grace period after the
      // pointer leaves, so it never vanishes under the cursor.
      this.startTimer(id, Math.max(timer.remaining, 800));
    }
  }

  private startTimer(id: number, ms: number): void {
    const handle = setTimeout(() => this.dismiss(id), ms);
    this.timers.set(id, { handle, remaining: ms, startedAt: Date.now() });
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer?.handle !== null && timer?.handle !== undefined) clearTimeout(timer.handle);
    this.timers.delete(id);
  }

  private remove(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
