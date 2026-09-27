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

/** The bar's eight fixed tab slots, always rendered in this order (matching
 *  the approved mockup: case, customer, supplier, order, cargo, transaction,
 *  manifest, bill of lading). `order`/`file` are backed by a real open
 *  `ContextItem` (clickable, closeable); the other six are read-only values
 *  derived from whichever item owns them. */
type TabKey =
  | 'order'
  | 'file'
  | 'supplierName'
  | 'customerName'
  | 'cargoDescription'
  | 'transactionNumber'
  | 'manifestNumber'
  | 'billOfLadingNumber';

type MetaTabKey = Exclude<TabKey, 'order' | 'file'>;

const TAB_ORDER: readonly TabKey[] = [
  'file',
  'customerName',
  'supplierName',
  'order',
  'cargoDescription',
  'transactionNumber',
  'manifestNumber',
  'billOfLadingNumber',
];

/** Which open item type each of the six derived fields is read from — never
 *  both, so a case's cargo/transaction/manifest/bill-of-lading fields never
 *  leak into an unrelated order's tabs and vice versa. */
const META_OWNER: Record<MetaTabKey, ContextItemType> = {
  supplierName: 'order',
  customerName: 'order',
  cargoDescription: 'file',
  transactionNumber: 'file',
  manifestNumber: 'file',
  billOfLadingNumber: 'file',
};

/** A rendered tab: fixed `name`, `value` only once populated (null shows the
 *  name alone), and `item` set only for the two entity tabs — that's what
 *  makes them clickable/closeable while the other five stay inert. */
interface Tab {
  readonly key: TabKey;
  readonly name: string;
  readonly value: string | null;
  readonly item: ContextItem | null;
}

/** A saved entity has a plain numeric id; a not-yet-saved draft uses
 *  `DRAFT_ITEM_ID` ('draft') — only the former counts as a displayable value. */
function isSavedId(id: string): boolean {
  return /^\d+$/.test(id);
}

function keyOf(item: ContextItem): string {
  return `${item.type}:${item.id}`;
}

/**
 * The workspace's fixed 8-tab status strip: Shipping Case, Customer Name,
 * Supplier Name, Order Number, Cargo Description, Transaction Number,
 * Customs Declaration Number and Bill of Lading Number — always visible,
 * showing just their name until populated. Reads *only* from
 * `ActiveContextService` — no route or
 * component-lifecycle state feeds it, which is the whole point: navigating
 * around the app must never silently change what's shown here. The two
 * entity tabs (Order Number / Shipping Case) leave only via the X button
 * (after an unsaved-changes check) or the owning screen's own Cancel action,
 * never as a side effect of anything else.
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
  protected readonly dirtyLabel = 'שינויים שלא נשמרו';

  /** Fixed display name for each of the eight tabs — shown alone until the tab has a value. */
  private readonly TAB_NAMES: Record<TabKey, string> = {
    order: 'מספר הזמנה',
    file: 'מספר תיק עמילות מכס',
    supplierName: 'שם ספק',
    customerName: 'שם לקוח',
    cargoDescription: 'תיאור טובין',
    transactionNumber: 'מספר עסקה',
    manifestNumber: 'מספר מצהר',
    billOfLadingNumber: 'מספר שטר מטען',
  };

  private readonly tabEls = viewChildren<ElementRef<HTMLElement>>('tabRef');

  /** Builds the eight fixed tabs in order. `order`/`file` show the entity's
   *  real id as their value (never a draft id); the other six show whichever
   *  `meta` field their owning item currently has set. Nothing here is ever
   *  hidden — an absent value just means "name only". */
  protected tabs(): Tab[] {
    const orderItem = this.activeContext.byType('order')()[0] ?? null;
    const fileItem = this.activeContext.byType('file')()[0] ?? null;
    const itemsByType: Record<ContextItemType, ContextItem | null> = {
      order: orderItem,
      file: fileItem,
    };

    return TAB_ORDER.map((key) => {
      if (key === 'order' || key === 'file') {
        const item = itemsByType[key];
        const value = item && isSavedId(item.id) ? item.id : null;
        return { key, name: this.TAB_NAMES[key], value, item };
      }

      const owner = itemsByType[META_OWNER[key]];
      const meta = owner?.meta as Record<string, unknown> | undefined;
      const raw = meta?.[key];
      const value = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
      return { key, name: this.TAB_NAMES[key], value, item: null };
    });
  }

  /** Tooltip text — the template renders `name`/`value` as separate lines. */
  protected tabTooltip(tab: Tab): string {
    return tab.value ? `${tab.name}: ${tab.value}` : tab.name;
  }

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

  /** A tab with no backing item (an empty placeholder, or one of the five
   *  read-only fields) is inert — clicking/keying it does nothing. */
  protected activateTab(item: ContextItem | null): void {
    if (item) this.activate(item);
  }

  protected onTabKeydown(event: KeyboardEvent, item: ContextItem | null): void {
    if (!item) return;
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
