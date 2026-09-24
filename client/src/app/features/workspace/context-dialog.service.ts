import { Injectable, signal } from '@angular/core';

import type { ContextItem, ContextItemType } from './active-context.model';

export type UnsavedChangesChoice = 'save' | 'discard' | 'cancel';
export type CreateNewChoice = 'continueExisting' | 'createNew' | 'cancel';

interface PendingCreateNew {
  readonly type: ContextItemType;
  readonly existing: ContextItem;
}

/**
 * Single, app-wide orchestration point for the two confirmation dialogs used
 * by the context bar's close flow and by the open/create-new/deactivate
 * guards (`core/guards/`). Rendered once by `ContextBar`, which is always
 * mounted in the workspace shell — every caller (guards included) just awaits
 * a Promise, with no component wiring of their own needed.
 */
@Injectable({ providedIn: 'root' })
export class ContextDialogService {
  readonly pendingUnsavedChanges = signal<ContextItem | null>(null);
  readonly pendingCreateNew = signal<PendingCreateNew | null>(null);

  private unsavedResolver: ((choice: UnsavedChangesChoice) => void) | null = null;
  private createNewResolver: ((choice: CreateNewChoice) => void) | null = null;

  confirmUnsavedChanges(item: ContextItem): Promise<UnsavedChangesChoice> {
    this.pendingUnsavedChanges.set(item);
    return new Promise<UnsavedChangesChoice>((resolve) => {
      this.unsavedResolver = resolve;
    });
  }

  resolveUnsavedChanges(choice: UnsavedChangesChoice): void {
    this.pendingUnsavedChanges.set(null);
    const resolve = this.unsavedResolver;
    this.unsavedResolver = null;
    resolve?.(choice);
  }

  confirmCreateNew(type: ContextItemType, existing: ContextItem): Promise<CreateNewChoice> {
    this.pendingCreateNew.set({ type, existing });
    return new Promise<CreateNewChoice>((resolve) => {
      this.createNewResolver = resolve;
    });
  }

  resolveCreateNew(choice: CreateNewChoice): void {
    this.pendingCreateNew.set(null);
    const resolve = this.createNewResolver;
    this.createNewResolver = null;
    resolve?.(choice);
  }
}
