import { computed, inject, Injectable, Injector, runInInjectionContext, signal } from '@angular/core';

import { canDeactivateCurrentItemGuard } from '../../core/guards/can-deactivate.guard';
import { createNewGuard } from '../../core/guards/create-new.guard';
import { DRAFT_ITEM_ID } from './active-context.model';
import { PageKey, ScreenId, TreeChild, TreeNode } from './navigation.model';

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
  private readonly injector = inject(Injector);

  /** The sidebar tree. Built by {@link setupTreeNavigation}. */
  readonly tree = signal<TreeNode[]>([]);

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

  constructor() {
    this.setupTreeNavigation();
  }

  /**
   * Builds the navigation tree, wires each page to its screen, and selects the
   * default landing page. Mirrors the mock's `setupTreeNavigation()`.
   */
  setupTreeNavigation(): void {
    const tree: TreeNode[] = [
      {
        id: 'workstations',
        label: 'תחנות עבודה',
        icon: 'fa-solid fa-desktop',
        children: [
          { id: 'ws-order', page: 'order', label: 'יצירת הזמנה חדשה', icon: 'fa-solid fa-file-invoice' },
          { id: 'ws-filing', page: 'filing', label: 'תיוק ניירת יבוא', icon: 'fa-solid fa-file-import' },
          { id: 'ws-shipment', page: 'shipment', label: 'יצירת תיק שילוח', icon: 'fa-solid fa-truck-fast' },
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
        ],
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
      {
        id: 'shipmentSelect',
        label: 'בחר משלוח',
        icon: 'fa-solid fa-folder-tree',
        children: [
          { id: 'ws-my-orders', page: 'myOrders', label: 'ההזמנות שלי', icon: 'fa-solid fa-list' },
          { id: 'ws-my-files', page: 'myFiles', label: 'התיקים שלי', icon: 'fa-solid fa-folder-open' },
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

    // Default landing: first node open, first row selected (matches the mock).
    this.expandedNodes.set(new Set([tree[0].id]));
    const first = tree[0].children[0];
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

  /** Select a child row: highlight it and show its screen. */
  selectChild(child: TreeChild): void {
    if (!this.screenMap.has(child.page)) return;
    this.activeChildId.set(child.id);
    this.activePage.set(child.page);
  }

  /**
   * Guarded entry point for sidebar clicks. `selectChild` itself stays a
   * plain, ungated primitive — it's also called internally by
   * `openOrderForEdit`/`openCaseForEdit`/`goToMyOrders`/`goToMyFiles`, which
   * are reached *after* a guard has already run (from `itemOpenGuard` or from
   * this method itself), so gating `selectChild` directly would double-prompt.
   */
  async trySelectChild(child: TreeChild): Promise<void> {
    let allowed: boolean;
    if (child.page === 'order') {
      allowed = await runInInjectionContext(this.injector, () =>
        createNewGuard('order', { id: DRAFT_ITEM_ID, label: 'הזמנה חדשה' }),
      );
    } else if (child.page === 'shipment') {
      allowed = await runInInjectionContext(this.injector, () =>
        createNewGuard('file', { id: DRAFT_ITEM_ID, label: 'תיק חדש' }),
      );
    } else {
      allowed = await runInInjectionContext(this.injector, () => canDeactivateCurrentItemGuard());
    }
    if (allowed) this.selectChild(child);
  }

  /** Whether a child row is the highlighted one. */
  isChildActive(childId: string): boolean {
    return this.activeChildId() === childId;
  }

  /** Navigate to the order screen with `orderId` queued up for it to load and edit. */
  openOrderForEdit(orderId: number): void {
    this.editOrderId.set(orderId);
    const child = this.tree()
      .flatMap((node) => node.children)
      .find((c) => c.page === 'order');
    if (child) {
      this.selectChild(child);
    } else {
      this.activePage.set('order');
    }
  }

  /** Navigate to the shipment/case screen with `caseId` queued up for editing. */
  openCaseForEdit(caseId: number): void {
    this.editCaseId.set(caseId);
    const child = this.tree()
      .flatMap((node) => node.children)
      .find((c) => c.page === 'shipment');
    if (child) {
      this.selectChild(child);
    } else {
      this.activePage.set('shipment');
    }
  }

  /** Fallback landing spot after closing the last open Order in the context bar. */
  goToMyOrders(): void {
    const child = this.tree()
      .flatMap((node) => node.children)
      .find((c) => c.page === 'myOrders');
    if (child) this.selectChild(child);
  }

  /** Fallback landing spot after closing the last open File in the context bar. */
  goToMyFiles(): void {
    const child = this.tree()
      .flatMap((node) => node.children)
      .find((c) => c.page === 'myFiles');
    if (child) this.selectChild(child);
  }
}
