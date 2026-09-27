import { InjectionToken } from '@angular/core';

/** The two kinds of thing the workspace bar can hold open. */
export type ContextItemType = 'order' | 'file';

/**
 * `single-per-type`: at most one open item per type — opening a different id
 * of an already-open type evicts the previous one. `multi-tab`: many items of
 * the same type may be open at once. See the architecture doc for why this
 * app ships with `single-per-type`.
 */
export type ContextMode = 'single-per-type' | 'multi-tab';

/** This app's default and only currently-used mode. */
export const CONTEXT_MODE = new InjectionToken<ContextMode>('CONTEXT_MODE', {
  providedIn: 'root',
  factory: () => 'single-per-type',
});

/** Off by default — flips on cross-tab sync via BroadcastChannel. */
export const CONTEXT_BROADCAST_ENABLED = new InjectionToken<boolean>('CONTEXT_BROADCAST_ENABLED', {
  providedIn: 'root',
  factory: () => false,
});

/** One open Order or File. Identity is the (type, id) pair, not `id` alone. */
export interface ContextItem {
  readonly type: ContextItemType;
  readonly id: string;
  readonly label: string;
  readonly dirty: boolean;
  readonly createdAt: number;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** What a caller provides to `open()`; `dirty`/`createdAt` are service-managed. */
export type OpenContextItemInput = Pick<ContextItem, 'type' | 'id' | 'label'> & {
  meta?: Readonly<Record<string, unknown>>;
};

/**
 * Id used for a not-yet-saved item opened via the "create new" guard, before
 * any real entity id exists. Non-numeric by design: `ActiveContextService`'s
 * rehydration already treats any non-numeric id as an unsaved draft that
 * can't survive a reload and drops it (see `stillExists`).
 */
export const DRAFT_ITEM_ID = 'draft';
