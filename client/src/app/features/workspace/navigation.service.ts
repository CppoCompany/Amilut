import { computed, Injectable, signal } from '@angular/core';

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
          { id: 'ws-order', page: 'order', label: 'פתיחת הזמנה', icon: 'fa-solid fa-file-invoice' },
          { id: 'ws-filing', page: 'filing', label: 'תיוק ניירת יבוא', icon: 'fa-solid fa-file-import' },
          { id: 'ws-shipment', page: 'shipment', label: 'ניהול תיק', icon: 'fa-solid fa-truck-fast' },
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
        children: [],
      },
    ];

    this.tree.set(tree);

    // page → screen. Repeated/unbuilt pages fall back to the placeholder screen.
    this.screenMap.set('order', 'order');
    this.screenMap.set('filing', 'filing');
    this.screenMap.set('shipment', 'shipment');
    this.screenMap.set('classification', 'classification');
    this.screenMap.set('importDeclaration', 'importDeclaration');
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

  /** Whether a child row is the highlighted one. */
  isChildActive(childId: string): boolean {
    return this.activeChildId() === childId;
  }
}
