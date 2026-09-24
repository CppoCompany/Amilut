import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  viewChildren,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ActiveContextService } from '../active-context.service';
import type { ContextItem, ContextItemType } from '../active-context.model';
import { ContextDialogService } from '../context-dialog.service';
import { NavigationService } from '../navigation.service';
import { ConfirmCreateNewDialog } from './confirm-create-new-dialog/confirm-create-new-dialog';
import { UnsavedChangesDialog } from './unsaved-changes-dialog/unsaved-changes-dialog';

/**
 * The workspace's "what do I have open" bar. Reads *only* from
 * `ActiveContextService` — no route or component-lifecycle state feeds it,
 * which is the whole point: navigating around the app must never silently
 * change what's shown here. Items leave only via the X button (after an
 * unsaved-changes check), never as a side effect of anything else.
 *
 * Also hosts both confirmation dialogs (`ContextDialogService`'s pending
 * signals) since it's the one component always mounted in the workspace
 * shell — the guards in `core/guards/` trigger the same two dialogs from
 * outside this component, with no component wiring of their own.
 */
@Component({
  selector: 'app-context-bar',
  imports: [UnsavedChangesDialog, ConfirmCreateNewDialog],
  templateUrl: './context-bar.html',
  styleUrl: './context-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContextBar {
  protected readonly activeContext = inject(ActiveContextService);
  protected readonly dialogs = inject(ContextDialogService);
  private readonly nav = inject(NavigationService);
  private readonly injector = inject(Injector);

  /** Hebrew UI strings, centralized here — this app has no i18n library yet
   *  (see Subtask 1 findings); keeping them as named lookups rather than
   *  scattered inline literals is what "translatable" means today. */
  protected readonly TYPE_LABEL: Record<ContextItemType, string> = {
    order: 'הזמנה',
    file: 'תיק',
  };
  protected readonly TYPE_ICON: Record<ContextItemType, string> = {
    order: 'fa-solid fa-file-invoice', // matches the sidebar's own order icon
    file: 'fa-solid fa-truck-fast', // matches the sidebar's own file/shipment icon
  };
  protected readonly emptyLabel = 'אין פריטים פתוחים';
  protected readonly dirtyLabel = 'שינויים שלא נשמרו';

  private readonly tabEls = viewChildren<ElementRef<HTMLElement>>('tabRef');

  protected isCurrent(item: ContextItem): boolean {
    return this.activeContext.currentId() === keyOf(item);
  }

  protected statusLabel(item: ContextItem): string | null {
    const meta = item.meta as { statusLabel?: string } | undefined;
    return meta?.statusLabel ?? null;
  }

  protected fullLabel(item: ContextItem): string {
    return `${this.TYPE_LABEL[item.type]} ${item.label}`;
  }

  protected closeButtonLabel(item: ContextItem): string {
    return `סגור ${this.fullLabel(item)}`;
  }

  protected itemKey(item: ContextItem): string {
    return keyOf(item);
  }

  /** Switches the active screen to this item without changing what's open. */
  protected activate(item: ContextItem): void {
    this.activeContext.setCurrent(item.type, item.id);
    this.openScreenFor(item);
  }

  protected onTabKeydown(event: KeyboardEvent, item: ContextItem): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.activate(item);
    }
  }

  /** Entry point for the X button. Never called by the tab's own click/keydown. */
  protected async requestClose(item: ContextItem, event: Event): Promise<void> {
    event.stopPropagation();

    if (item.dirty) {
      const choice = await this.dialogs.confirmUnsavedChanges(item);
      if (choice === 'cancel') return;
      if (choice === 'save') {
        const saved = await firstValueFrom(this.activeContext.requestSave(item.type, item.id));
        if (!saved) return; // leave it open — nothing else useful to do here
      }
    }
    this.finishClose(item);
  }

  private finishClose(item: ContextItem): void {
    const key = keyOf(item);
    const wasCurrent = this.activeContext.currentId() === key;

    this.activeContext.close(item.type, item.id);
    if (!wasCurrent) return;

    const remaining = this.activeContext.items();
    const fallback = remaining[remaining.length - 1] ?? null;
    if (fallback) {
      this.activate(fallback);
      this.focusTab(fallback);
    } else {
      this.goToListPageFor(item.type);
      this.focusTab(null);
    }
  }

  private openScreenFor(item: ContextItem): void {
    const entityId = Number(item.id);
    if (!Number.isInteger(entityId) || entityId <= 0) return; // an unsaved draft has no screen to reopen
    if (item.type === 'order') {
      this.nav.openOrderForEdit(entityId);
    } else {
      this.nav.openCaseForEdit(entityId);
    }
  }

  private goToListPageFor(type: ContextItemType): void {
    if (type === 'order') {
      this.nav.goToMyOrders();
    } else {
      this.nav.goToMyFiles();
    }
  }

  /** Moves DOM focus to the given item's tab once Angular re-renders, or does
   *  nothing (rather than leaving focus lost) when the bar is now empty. */
  private focusTab(item: ContextItem | null): void {
    afterNextRender(
      () => {
        if (!item) return;
        const key = keyOf(item);
        this.tabEls()
          .find((ref) => ref.nativeElement.dataset['key'] === key)
          ?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }
}

function keyOf(item: ContextItem): string {
  return `${item.type}:${item.id}`;
}
