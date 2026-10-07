import { computed, inject, Injectable, signal } from '@angular/core';
import { ParamMap, Router } from '@angular/router';

import {
  isTreeChildGroup,
  LIST_PAGE_KEYS,
  ListPageKey,
  PageKey,
  ScreenId,
  TreeChild,
  TreeEntry,
} from './navigation.model';

/** All leaf rows in the tree, whether a plain top-level row or nested inside
 *  an expandable group — the flat list `selectChild`'s callers search by page. */
function flattenLeaves(tree: readonly TreeEntry[]): TreeChild[] {
  return tree.flatMap((entry) => (isTreeChildGroup(entry) ? entry.children : [entry]));
}

/** First URL segment of every workspace screen: `/workspace/<slug>`. */
export const WORKSPACE_URL_SEGMENT = 'workspace';

/** The slug every unknown/blank slug falls back to (`/workspace/dashboard`). */
export const DEFAULT_SLUG = 'dashboard';

/** Sidebar row ids start with this; the slug is the id without it. */
const SLUG_ID_PREFIX = 'ws-';

/** Query-param names carrying an "open X for edit" hand-off between screens. */
export const ORDER_ID_QUERY_PARAM = 'orderId';
export const CASE_ID_QUERY_PARAM = 'caseId';

/** A positive integer query param, or `null` when absent/malformed. */
function readIdParam(query: ParamMap, name: string): number | null {
  const raw = query.get(name);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Owns the sidebar tree and decides which content screen is visible.
 *
 * This is the Angular home for the mock's `setupTreeNavigation()` /
 * `showPanel()` logic. The tree model drives the sidebar, and a
 * {@link screenMap} (page → screen) keeps the show/hide decision in one place —
 * exactly the mapping the mock expressed as a `switch` inside `showPanel`.
 *
 * The URL is the single source of truth for what is shown: every screen lives
 * at `/workspace/<slug>` (see {@link slugOf}). Clicking a row only *navigates*
 * ({@link selectChild}); the Workspace shell feeds the resulting `:slug` and
 * query params back in through {@link applyUrl}, which is the only place the
 * active page/row are set. That is what makes Back/Forward, refresh and deep
 * links work — history entries are just URLs.
 */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly router = inject(Router);

  /** The sidebar tree. Built by {@link setupTreeNavigation}. */
  readonly tree = signal<TreeEntry[]>([]);

  /** Ids of the nodes currently expanded. */
  private readonly expandedNodes = signal<ReadonlySet<string>>(new Set());

  /** The page whose screen is currently shown. Only {@link applyUrl} sets it;
   *  the initial value is just a placeholder until the first URL is applied. */
  private readonly activePage = signal<PageKey>('dashboard');

  /** The child row currently highlighted (pages can repeat, rows can't). */
  private readonly activeChildId = signal<string>('ws-dashboard');

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

  /** The currently-highlighted sidebar row (for the breadcrumb trail). */
  readonly activeChild = computed<TreeChild | null>(() => {
    const id = this.activeChildId();
    return flattenLeaves(this.tree()).find((child) => child.id === id) ?? null;
  });

  /** The expandable group containing the active row, or `null` for a top-level row. */
  readonly activeGroupLabel = computed<string | null>(() => {
    const id = this.activeChildId();
    for (const entry of this.tree()) {
      if (isTreeChildGroup(entry) && entry.children.some((child) => child.id === id)) {
        return entry.label;
      }
    }
    return null;
  });

  /**
   * Order id another screen (e.g. a double-click in "ההזמנות שלי") wants the
   * order screen to load for editing. Travels in the URL as
   * `/workspace/order?orderId=N` (see {@link openOrderForEdit}) and is set here
   * by {@link applyUrl} — `null` whenever the current URL carries no id.
   * Consumed once — the order screen clears it as soon as it starts loading.
   */
  readonly editOrderId = signal<number | null>(null);

  /**
   * MBL id another screen (e.g. a double-click in "התיקים שלי") wants the
   * shipping-case wizard to load for editing. Travels in the URL as
   * `/workspace/shipment?caseId=N` (see {@link openCaseForEdit}) and is set here
   * by {@link applyUrl} — `null` whenever the current URL carries no id.
   * Consumed once — the wizard clears it as soon as it starts loading.
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
   * Builds the navigation tree and wires each page to its screen. Mirrors the
   * mock's `setupTreeNavigation()`. The landing page is not chosen here: the
   * `workspace` → `workspace/dashboard` route redirect provides it, and
   * {@link applyUrl} applies it like any other URL.
   */
  setupTreeNavigation(): void {
    const tree: TreeEntry[] = [
      { id: 'ws-dashboard', page: 'dashboard', label: 'לוח בקרה', icon: 'fa-solid fa-gauge' },
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
            page: 'shipmentCaseWizard',
            label: 'יצירת תיק שילוח',
            icon: 'fa-solid fa-truck-fast',
          },
        ],
      },
      {
        id: 'ws-lists-group',
        label: 'רשימות',
        icon: 'fa-solid fa-table-list',
        children: [
          {
            id: 'ws-list-my-orders',
            page: 'listMyOrders',
            label: 'ההזמנות שלי',
            icon: 'fa-solid fa-file-invoice',
          },
          {
            id: 'ws-list-cases-in-release',
            page: 'listCasesInRelease',
            label: 'תיקים בהתרה',
            icon: 'fa-solid fa-clipboard-check',
          },
          {
            id: 'ws-list-my-classifications',
            page: 'listMyClassifications',
            label: 'הסיווגים שלי',
            icon: 'fa-solid fa-tags',
          },
          {
            id: 'ws-list-my-cases',
            page: 'listMyCases',
            label: 'התיקים שלי',
            icon: 'fa-solid fa-folder-open',
          },
          {
            id: 'ws-list-import-processes',
            page: 'listImportProcesses',
            label: 'תהליכי יבוא',
            icon: 'fa-solid fa-ship',
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
    this.screenMap.set('dashboard', 'dashboard');
    this.screenMap.set('order', 'order');
    this.screenMap.set('filing', 'filing');
    this.screenMap.set('shipmentCaseWizard', 'shipmentCaseWizard');
    this.screenMap.set('classification', 'classification');
    this.screenMap.set('importDeclaration', 'importDeclaration');
    this.screenMap.set('myOrders', 'myOrders');
    this.screenMap.set('myFiles', 'myFiles');
    this.screenMap.set('search', 'placeholder');
    this.screenMap.set('placeholder', 'placeholder');
    // "רשימות": every list page renders its own screen of the same name.
    for (const listPage of LIST_PAGE_KEYS) {
      this.screenMap.set(listPage, listPage);
    }

    // No group starts expanded; applyUrl reveals whichever group holds the
    // row the URL names.
    this.expandedNodes.set(new Set());
  }

  // ── URL ↔ row mapping ──────────────────────────────────────────────────────

  /** The URL slug of a row: its id without the `ws-` prefix
   *  (`ws-my-orders` → `my-orders`); ids without the prefix (the
   *  "הצהרת יבוא" children, `imp-*`) are used as-is. */
  slugOf(child: TreeChild): string {
    return child.id.startsWith(SLUG_ID_PREFIX) ? child.id.slice(SLUG_ID_PREFIX.length) : child.id;
  }

  /** The row a URL slug names, or `null` for an unknown slug. */
  childBySlug(slug: string): TreeChild | null {
    return flattenLeaves(this.tree()).find((child) => this.slugOf(child) === slug) ?? null;
  }

  /**
   * Applies the current URL (`/workspace/:slug` + query params) — the only
   * place the active page/row are set. Called by the Workspace shell from its
   * route subscription, so it runs for clicks, Back/Forward, refresh and deep
   * links alike.
   *
   * Edit hand-offs ride along as query params: `?orderId=N` on the `order`
   * slug or `?caseId=N` on the `shipment` slug queue that id for the screen
   * (see {@link editOrderId} / {@link editCaseId}). While editing, the
   * highlighted row is the list the edit came from ("ההזמנות שלי" /
   * "התיקים שלי"), not the "create new" row — the same choice
   * {@link openOrderForEdit} / {@link openCaseForEdit} always made.
   *
   * An unknown slug is replaced (no history entry) by the dashboard.
   */
  applyUrl(slug: string, query: ParamMap): void {
    const child = this.childBySlug(slug);
    if (!child || !this.screenMap.has(child.page)) {
      void this.router.navigate(['/', WORKSPACE_URL_SEGMENT, DEFAULT_SLUG], { replaceUrl: true });
      return;
    }

    const orderId = child.page === 'order' ? readIdParam(query, ORDER_ID_QUERY_PARAM) : null;
    const caseId = child.page === 'shipmentCaseWizard' ? readIdParam(query, CASE_ID_QUERY_PARAM) : null;
    // Set the hand-off ids *before* the page, so a screen mounted by the page
    // change already finds its id when its constructor runs.
    this.editOrderId.set(orderId);
    this.editCaseId.set(caseId);

    let rowId = child.id;
    if (orderId !== null) rowId = this.leafByPage('myOrders')?.id ?? rowId;
    if (caseId !== null) rowId = this.leafByPage('myFiles')?.id ?? rowId;
    this.setActiveRow(child.page, rowId);
  }

  private leafByPage(page: PageKey): TreeChild | undefined {
    return flattenLeaves(this.tree()).find((c) => c.page === page);
  }

  /** The URL commands for a row, for `router.navigate`. */
  private urlCommandsFor(child: TreeChild): string[] {
    return ['/', WORKSPACE_URL_SEGMENT, this.slugOf(child)];
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
   * Select a child row: navigate to its URL (`/workspace/<slug>`, no query
   * params — so any edit hand-off is dropped). The Workspace shell then feeds
   * the new URL back through {@link applyUrl}, which highlights the row, shows
   * its screen and reveals its sub-group if collapsed. Re-selecting the
   * current row is a same-URL navigation, which the router ignores (no
   * duplicate history entry).
   *
   * "יצירת הזמנה חדשה"/"יצירת תיק שילוח" are the only rows on the
   * `order`/`shipmentCaseWizard` pages, so clicking either one always means
   * "start a fresh draft" — bump the matching counter so the screen (which
   * may already be mounted mid-draft, since the page — and possibly even the
   * URL — doesn't change) resets instead of silently keeping the old one on
   * screen. This fires on every click, even when the row is already active.
   */
  selectChild(child: TreeChild): void {
    if (!this.screenMap.has(child.page)) return;
    if (child.page === 'order') this.newOrderRequested.update((n) => n + 1);
    if (child.page === 'shipmentCaseWizard') this.newCaseRequested.update((n) => n + 1);
    void this.router.navigate(this.urlCommandsFor(child));
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
   *  edit: `/workspace/order?orderId=N`. {@link applyUrl} highlights
   *  "ההזמנות שלי" (not "יצירת הזמנה חדשה"), since editing an existing order
   *  was reached from there, not from the create-new row. */
  openOrderForEdit(orderId: number): void {
    const row = this.leafByPage('order');
    if (!row) return;
    void this.router.navigate(this.urlCommandsFor(row), {
      queryParams: { [ORDER_ID_QUERY_PARAM]: orderId },
    });
  }

  /** Navigate to the shipping-case wizard with `caseId` (an MBL id) queued up
   *  for it to load and edit: `/workspace/shipment?caseId=N`. Highlights
   *  "התיקים שלי" (not "יצירת תיק שילוח"), same reasoning as
   *  {@link openOrderForEdit}. */
  openCaseForEdit(caseId: number): void {
    const row = this.leafByPage('shipmentCaseWizard');
    if (!row) return;
    void this.router.navigate(this.urlCommandsFor(row), {
      queryParams: { [CASE_ID_QUERY_PARAM]: caseId },
    });
  }

  /** Fallback landing spot after closing the last open Order in the context bar. */
  goToMyOrders(): void {
    const child = this.leafByPage('myOrders');
    if (child) this.selectChild(child);
  }

  /** Fallback landing spot after closing the last open File in the context bar. */
  goToMyFiles(): void {
    const child = this.leafByPage('myFiles');
    if (child) this.selectChild(child);
  }

  /** Opens one of the "רשימות" list pages (e.g. a dashboard's "צפה בהכל" link). */
  goToList(page: ListPageKey): void {
    const child = this.leafByPage(page);
    if (child) this.selectChild(child);
  }

  /** Selects a sidebar row by its id (e.g. `ws-classification`), exactly like clicking it. */
  selectChildById(childId: string): void {
    const child = flattenLeaves(this.tree()).find((c) => c.id === childId);
    if (child) this.selectChild(child);
  }
}
