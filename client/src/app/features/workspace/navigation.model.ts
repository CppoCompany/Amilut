/**
 * Navigation model for the workspace tree/sidebar.
 *
 * A `page` is what the user clicks in the sidebar; a `ScreenId` is the panel the
 * content area renders. The mapping between them lives in {@link NavigationService}
 * (see its `screenMap`), mirroring the original mock's `showPanel(page)` switch.
 */

/**
 * The "רשימות" (lists) pages — full "view all" grids, one per dataset. Each is
 * both a page in the sidebar group and the screen it renders (1:1), and the
 * dashboard links to them by this key via `NavigationService.goToList`.
 */
export type ListPageKey =
  | 'listMyOrders'
  | 'listCasesInRelease'
  | 'listMyClassifications'
  | 'listMyCases'
  | 'listImportProcesses';

export const LIST_PAGE_KEYS: readonly ListPageKey[] = [
  'listMyOrders',
  'listCasesInRelease',
  'listMyClassifications',
  'listMyCases',
  'listImportProcesses',
];

/** Identifier for a clickable page in the sidebar tree. */
export type PageKey =
  | 'dashboard'
  | 'order'
  | 'filing'
  | 'shipmentCaseWizard'
  | 'classification'
  | 'importDeclaration'
  | 'myOrders'
  | 'myFiles'
  | 'search'
  | 'placeholder'
  | ListPageKey;

/** Identifier for a content panel the workspace can render. */
export type ScreenId =
  | 'dashboard'
  | 'order'
  | 'filing'
  | 'shipmentCaseWizard'
  | 'classification'
  | 'importDeclaration'
  | 'myOrders'
  | 'myFiles'
  | 'placeholder'
  | ListPageKey;

/** A leaf item — one clickable row in the sidebar, whether at the top level
 *  or nested inside a {@link TreeChildGroup}. */
export interface TreeChild {
  /** Stable, unique id used to track which row is highlighted. */
  id: string;
  /** The page this row navigates to. */
  page: PageKey;
  /** Row label (Hebrew). */
  label: string;
  /** Font Awesome icon class, e.g. `fa-file-invoice`. */
  icon: string;
  /** Omits the row from the rendered sidebar (both the expanded tree and the
   *  collapsed icon rail) while keeping it fully "real" for everything else —
   *  URL slug resolution, `leafByPage`, the breadcrumb trail. Used for screens
   *  reached only through another screen's own button, never directly from
   *  the sidebar (e.g. "תיוק ניירת יבוא" — see `NavigationService.openFilingForCase`). */
  hidden?: boolean;
}

/**
 * An expandable group of leaf rows — e.g. "הזמנות" bundling "ההזמנות שלי" +
 * "יצירת הזמנה חדשה" under one collapsible row with its own arrow.
 * Expands/collapses via `NavigationService.toggleNode`/`isNodeExpanded` (ids
 * just have to be unique across the whole tree). Distinguished from a
 * {@link TreeChild} by having `children` instead of `page` — see
 * {@link isTreeChildGroup}.
 */
export interface TreeChildGroup {
  /** Stable, unique id for the group (used for expand/collapse state). */
  id: string;
  /** Group label (Hebrew). */
  label: string;
  /** Font Awesome icon class. */
  icon: string;
  /** Leaf rows shown when the group is expanded. */
  children: TreeChild[];
}

/** One row in the sidebar tree — either a plain leaf, or an expandable group of leaves. */
export type TreeEntry = TreeChild | TreeChildGroup;

export function isTreeChildGroup(entry: TreeEntry): entry is TreeChildGroup {
  return 'children' in entry;
}
