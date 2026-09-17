/**
 * Navigation model for the workspace tree/sidebar.
 *
 * A `page` is what the user clicks in the sidebar; a `ScreenId` is the panel the
 * content area renders. The mapping between them lives in {@link NavigationService}
 * (see its `screenMap`), mirroring the original mock's `showPanel(page)` switch.
 */

/** Identifier for a clickable page in the sidebar tree. */
export type PageKey =
  | 'order'
  | 'filing'
  | 'shipment'
  | 'classification'
  | 'importDeclaration'
  | 'myOrders'
  | 'myFiles'
  | 'search'
  | 'placeholder';

/** Identifier for a content panel the workspace can render. */
export type ScreenId =
  | 'order'
  | 'filing'
  | 'shipment'
  | 'classification'
  | 'importDeclaration'
  | 'myOrders'
  | 'myFiles'
  | 'placeholder';

/** A leaf item under a tree node — one row in the sidebar. */
export interface TreeChild {
  /** Stable, unique id used to track which row is highlighted. */
  id: string;
  /** The page this row navigates to. */
  page: PageKey;
  /** Row label (Hebrew). */
  label: string;
  /** Font Awesome icon class, e.g. `fa-file-invoice`. */
  icon: string;
}

/** A collapsible top-level node in the sidebar tree. */
export interface TreeNode {
  /** Stable, unique id for the node. */
  id: string;
  /** Node label (Hebrew). */
  label: string;
  /** Font Awesome icon class. */
  icon: string;
  /** Child rows shown when the node is expanded. */
  children: TreeChild[];
}
