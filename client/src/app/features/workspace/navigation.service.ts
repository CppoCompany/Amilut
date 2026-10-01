import { computed, Injectable, signal } from '@angular/core';

import { isTreeChildGroup, PageKey, ScreenId, TreeChild, TreeEntry } from './navigation.model';

/** All leaf rows in the tree, whether a plain top-level row or nested inside
 *  an expandable group — the flat list `selectChild`'s callers search by page. */
function flattenLeaves(tree: readonly TreeEntry[]): TreeChild[] {
  return tree.flatMap((entry) => (isTreeChildGroup(entry) ? entry.children : [entry]));
}

/**
 * Owns the sidebar tree and decides which content screen is visible.
 *
 * This is the Angular home for the mock's `setupTreeNavigation()` /
 * `showPanel()` logic. The tree model drives the sidebar, and a
 * {@link screenMap} (page → screen) keeps the show/hide decision in one place —
 * exactly the mapping the mock expressed as a `switch` inside `showPanel`.
 */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  /** The sidebar tree. Built by {@link setupTreeNavigation}. */
  readonly tree = signal<TreeEntry[]>([]);

  /** Ids of the nodes currently expanded. */
  private readonly expandedNodes = signal<ReadonlySet<string>>(new Set());

  /** The page whose screen is currently shown. */
  private readonly activePage = signal<PageKey>('order');

  /** The child row currently highlighted (pages can repeat, rows can't). */
  private readonly activeChildId = signal<string>('');

  /**
   * Maps each navigable page to the content screen it reveals. This is the
   * single source of truth for showing/hiding screens — swap the panel here,
   * not in the template.
   */
  private readonly screenMap = new Map<PageKey, ScreenId>();

  /** The screen the content area should render for the active page. */
  readonly activeScreen = computed<ScreenId>(
    () => this.screenMap.get(this.activePage()) ?? 'placeholder',
  );

  /**
   * Order id another screen (e.g. a double-click in "ההזמנות שלי") wants the
   * order screen to load for editing, set via {@link openOrderForEdit}.
   * Consumed once — the order screen clears it immediately after reading it.
   */
  readonly editOrderId = signal<number | null>(null);

  /**
   * Case id another screen (e.g. a double-click in "התיקים שלי") wants the
   * shipment/case screen to load for editing, set via {@link openCaseForEdit}.
   * Consumed once — the shipment screen clears it immediately after reading it.
   */
  readonly editCaseId = signal<number | null>(null);

  /**
   * Bumped each time "יצירת הזמנה חדשה"/"יצירת תיק שילוח" is explicitly
   * selected from the sidebar (see {@link selectChild}) — the order/shipment
   * screens watch this to reset to a blank draft even when already mounted
   * (navigating there doesn't change `activePage`, so the component instance
   * — and whatever existing order/case it was editing — otherwise persists).
   */
  readonly newOrderRequested = signal(0);
  readonly newCaseRequested = signal(0);

  constructor() {
    this.setupTreeNavigation();
  }

  /**
   * Builds the navigation tree, wires each page to its screen, and selects the
   * default landing page. Mirrors the mock's `setupTreeNavigation()`.
   */
  setupTreeNavigation(): void {
    const tree: TreeEntry[] = [
      {
        id: 'ws-orders-group',
        label: 'הזמנות',
        icon: 'fa-solid fa-file-invoice',
        children: [
          { id: 'ws-my-orders', page: 'myOrders', label: 'ההזמנות שלי', icon: 'fa-solid fa-list' },
          { id: 'ws-order', page: 'order', label: 'יצירת הזמנה חדשה', icon: 'fa-solid fa-file-invoice' },
        ],
      },
      { id: 'ws-filing', page: 'filing', label: 'תיוק ניירת יבוא', icon: 'fa-solid fa-file-import' },
      {
        id: 'ws-shipment-group',
        label: 'תיקי שילוח',
        icon: 'fa-solid fa-truck-fast',
        children: [
          { id: 'ws-my-files', page: 'myFiles', label: 'התיקים שלי', icon: 'fa-solid fa-folder-open' },
          {
            id: 'ws-shipment',
            page: 'shipment',
            label: 'יצירת תיק שילוח',
            icon: 'fa-solid fa-truck-fast',
          },
        ],
      },
      { id: 'ws-classification', page: 'classification', label: 'סיווג', icon: 'fa-solid fa-tags' },
      {
        id: 'ws-post-classification',
        page: 'placeholder',
        label: 'השלמה לאחר סיווג',
        icon: 'fa-solid fa-check-double',
      },
      {
        id: 'ws-doc-review',
        page: 'placeholder',
        label: 'ביקורת מסמכים',
        icon: 'fa-solid fa-magnifying-glass',
      },
      {
        id: 'ws-transmit',
        page: 'placeholder',
        label: 'שידור הצהרה למכס',
        icon: 'fa-solid fa-file-signature',
      },
      {
        id: 'ws-land-transport',
        page: 'placeholder',
        label: 'תיאום הובלה יבשתית',
        icon: 'fa-solid fa-file-signature',
      },
      {
        id: 'importDeclaration',
        label: 'הצהרת יבוא',
        icon: 'fa-solid fa-folder-tree',
        children: [
          {
            id: 'imp-details',
            page: 'importDeclaration',
            label: 'פרטי הצהרת יבוא',
            icon: 'fa-solid fa-file-import',
          },
          {
            id: 'imp-invoice',
            page: 'importDeclaration',
            label: 'חשבון מכר',
            icon: 'fa-solid fa-file-import',
          },
          {
            id: 'imp-attachments',
            page: 'importDeclaration',
            label: 'צרופות',
            icon: 'fa-solid fa-file-import',
          },
          {
            id: 'imp-transmissions',
            page: 'importDeclaration',
            label: 'שידורים',
            icon: 'fa-solid fa-file-import',
          },
          {
            id: 'imp-submissions',
            page: 'importDeclaration',
            label: 'הגשות',
            icon: 'fa-solid fa-file-import',
          },
          {
            id: 'imp-notices',
            page: 'importDeclaration',
            label: 'הודעות מכס',
            icon: 'fa-solid fa-file-import',
          },
        ],
      },
    ];

    this.tree.set(tree);

    // page → screen. Repeated/unbuilt pages fall back to the placeholder screen.
    this.screenMap.set('order', 'order');
    this.screenMap.set('filing', 'filing');
    this.screenMap.set('shipment', 'shipment');
    this.screenMap.set('classification', 'classification');
    this.screenMap.set('importDeclaration', 'importDeclaration');
    this.screenMap.set('myOrders', 'myOrders');
    this.screenMap.set('myFiles', 'myFiles');
    this.screenMap.set('search', 'placeholder');
    this.screenMap.set('placeholder', 'placeholder');

    // Default landing: unchanged from before the Orders group existed — still
    // "יצירת הזמנה חדשה" — with the group that now contains it expanded, so
    // the highlighted row is visible rather than hidden inside a collapsed group.
    this.expandedNodes.set(new Set(['ws-orders-group']));
    const first = flattenLeaves(tree).find((c) => c.id === 'ws-order')!;
    this.activePage.set(first.page);
    this.activeChildId.set(first.id);
  }

  /** Expand/collapse a tree node. */
  toggleNode(nodeId: string): void {
    const next = new Set(this.expandedNodes());
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    this.expandedNodes.set(next);
  }

  /** Whether a node is currently expanded. */
  isNodeExpanded(nodeId: string): boolean {
    return this.expandedNodes().has(nodeId);
  }

  /**
   * Select a child row: highlight it, show its screen, and reveal it if its
   * sub-group happens to be collapsed — the active row should never be
   * hidden. "יצירת הזמנה חדשה"/"יצירת תיק שילוח" are the only rows on the
   * `order`/`shipment` pages, so clicking either one always means "start a
   * fresh draft" — bump the matching counter so the screen (which may already
   * be mounted mid-edit of a different order/case, since the page doesn't
   * change) resets instead of silently keeping the old one on screen.
   */
  selectChild(child: TreeChild): void {
    if (!this.screenMap.has(child.page)) return;
    if (child.page === 'order') this.newOrderRequested.update((n) => n + 1);
    if (child.page === 'shipment') this.newCaseRequested.update((n) => n + 1);
    this.setActiveRow(child.page, child.id);
  }

  private setActiveRow(page: PageKey, childId: string): void {
    this.activeChildId.set(childId);
    this.activePage.set(page);
    this.expandGroupContaining(childId);
  }

  /** Expands whichever group (if any) directly contains this leaf id. */
  private expandGroupContaining(childId: string): void {
    for (const entry of this.tree()) {
      if (isTreeChildGroup(entry) && entry.children.some((c) => c.id === childId)) {
        if (!this.expandedNodes().has(entry.id)) {
          this.expandedNodes.update((set) => new Set(set).add(entry.id));
        }
        return;
      }
    }
  }

  /** Whether a child row is the highlighted one. */
  isChildActive(childId: string): boolean {
    return this.activeChildId() === childId;
  }

  /** Navigate to the order screen with `orderId` queued up for it to load and
   *  edit — highlights "ההזמנות שלי" (not "יצירת הזמנה חדשה"), since editing
   *  an existing order was reached from there, not from the create-new row. */
  openOrderForEdit(orderId: number): void {
    this.editOrderId.set(orderId);
    const myOrders = flattenLeaves(this.tree()).find((c) => c.page === 'myOrders');
    if (myOrders) {
      this.setActiveRow('order', myOrders.id);
    } else {
      this.activePage.set('order');
    }
  }

  /** Navigate to the shipment/case screen with `caseId` queued up for editing
   *  — highlights "התיקים שלי" (not "יצירת תיק שילוח"), same reasoning as
   *  {@link openOrderForEdit}. */
  openCaseForEdit(caseId: number): void {
    this.editCaseId.set(caseId);
    const myFiles = flattenLeaves(this.tree()).find((c) => c.page === 'myFiles');
    if (myFiles) {
      this.setActiveRow('shipment', myFiles.id);
    } else {
      this.activePage.set('shipment');
    }
  }

  /** Fallback landing spot after closing the last open Order in the context bar. */
  goToMyOrders(): void {
    const child = flattenLeaves(this.tree()).find((c) => c.page === 'myOrders');
    if (child) this.selectChild(child);
  }

  /** Fallback landing spot after closing the last open File in the context bar. */
  goToMyFiles(): void {
    const child = flattenLeaves(this.tree()).find((c) => c.page === 'myFiles');
    if (child) this.selectChild(child);
  }
}
