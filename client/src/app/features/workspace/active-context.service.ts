import { Injectable, OnDestroy, Signal, computed, inject, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, map, of } from 'rxjs';

import { OrdersApi } from '../../api/orders-api';
import { ShipmentsApi } from '../../api/shipments-api';
import {
  CONTEXT_BROADCAST_ENABLED,
  CONTEXT_MODE,
  ContextItem,
  ContextItemType,
  ContextMode,
  OpenContextItemInput,
} from './active-context.model';

/** Bump the trailing version if `PersistedState`'s shape ever changes incompatibly. */
export const STORAGE_KEY = 'amilut.activeContext.v1';
const BROADCAST_CHANNEL_NAME = 'amilut-active-context';

interface PersistedState {
  readonly version: 1;
  readonly items: readonly ContextItem[];
  readonly currentId: string | null;
}

function keyOf(type: ContextItemType, id: string): string {
  return `${type}:${id}`;
}

function isPersistedState(value: unknown): value is PersistedState {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as PersistedState).version === 1 &&
    Array.isArray((value as PersistedState).items)
  );
}

/** Reads sessionStorage defensively — private browsing, a full quota, or no
 *  `sessionStorage` at all (e.g. a non-browser environment) can all throw or
 *  simply not exist; any of that just means "start with nothing persisted." */
function readStorage(): PersistedState | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPersistedState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStorage(state: PersistedState): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full/unavailable — the bar still works in-memory for this tab.
  }
}

function clearStorage(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * State layer for the workspace's "active context" bar: whatever Order and/or
 * File the user currently has open. Dedupes by `(type, id)`; in the default
 * `single-per-type` mode, opening a different id of an already-open type
 * evicts the previous one — nothing else ever removes an item implicitly.
 * There is deliberately no lifecycle-hook-driven clearing anywhere in this
 * service; `clear()` exists for genuinely explicit whole-session resets
 * (e.g. logout) and must never be wired to a component's destroy hook.
 */
@Injectable({ providedIn: 'root' })
export class ActiveContextService implements OnDestroy {
  private readonly mode: ContextMode = inject(CONTEXT_MODE);
  private readonly broadcastEnabled = inject(CONTEXT_BROADCAST_ENABLED);
  private readonly ordersApi = inject(OrdersApi);
  private readonly shipmentsApi = inject(ShipmentsApi);

  private readonly _items = signal<ReadonlyMap<string, ContextItem>>(new Map());
  private readonly _currentId = signal<string | null>(null);
  private readonly hasActiveCache = new Map<ContextItemType, Signal<boolean>>();
  private readonly byTypeCache = new Map<ContextItemType, Signal<readonly ContextItem[]>>();
  private readonly saveHandlers = new Map<string, () => Observable<boolean>>();
  private channel: BroadcastChannel | null = null;
  private readonly beforeUnloadListener = (event: BeforeUnloadEvent): void => {
    if (this.anyDirty()) {
      event.preventDefault();
      event.returnValue = ''; // legacy requirement for the native confirm prompt
    }
  };

  readonly items = computed(() => [...this._items().values()]);
  readonly currentId = this._currentId.asReadonly();
  readonly current = computed<ContextItem | null>(() => {
    const id = this._currentId();
    return id ? (this._items().get(id) ?? null) : null;
  });
  /** Drives the `beforeunload` prompt below and is available for any UI that
   *  wants to warn before a whole-session action (e.g. logout). */
  readonly anyDirty = computed(() => this.items().some((item) => item.dirty));

  /** Resolves once startup rehydration + backend validation has finished. */
  readonly ready: Promise<void>;

  constructor() {
    this.restoreFromStorage();
    this.ready = this.rehydrate();

    if (this.broadcastEnabled && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<PersistedState>) => {
        if (isPersistedState(event.data)) {
          this.applyState(event.data.items, event.data.currentId);
        }
      };
    }

    // Native browser-close/refresh protection — in-app navigation is guarded
    // separately (see core/guards/), this only covers leaving the tab itself.
    // Registered as a bound field (not an inline closure) so `ngOnDestroy` can
    // remove this exact listener — otherwise every instance of this
    // `providedIn: 'root'` service (e.g. one per test) would leak one onto
    // the real `window` forever.
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.beforeUnloadListener);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.beforeUnloadListener);
    }
    this.channel?.close();
  }

  /** Cached per type so template/computed callers get a stable Signal reference. */
  hasActive(type: ContextItemType): Signal<boolean> {
    let sig = this.hasActiveCache.get(type);
    if (!sig) {
      sig = computed(() => this.items().some((item) => item.type === type));
      this.hasActiveCache.set(type, sig);
    }
    return sig;
  }

  byType(type: ContextItemType): Signal<readonly ContextItem[]> {
    let sig = this.byTypeCache.get(type);
    if (!sig) {
      sig = computed(() => this.items().filter((item) => item.type === type));
      this.byTypeCache.set(type, sig);
    }
    return sig;
  }

  /**
   * Opens (or re-focuses) an item and makes it current. Re-opening the same
   * `(type, id)` updates its label/meta in place and preserves `dirty`. In
   * `single-per-type` mode, opening a *different* id of an already-open type
   * evicts that previous item first.
   */
  open(input: OpenContextItemInput): ContextItem {
    const key = keyOf(input.type, input.id);
    const existing = this._items().get(key);

    const item: ContextItem = {
      type: input.type,
      id: input.id,
      label: input.label,
      meta: input.meta,
      dirty: existing?.dirty ?? false,
      createdAt: existing?.createdAt ?? Date.now(),
    };

    this._items.update((current) => {
      const next = new Map(current);
      if (!existing && this.mode === 'single-per-type') {
        for (const [otherKey, otherItem] of next) {
          if (otherItem.type === input.type) next.delete(otherKey);
        }
      }
      next.set(key, item);
      return next;
    });
    this._currentId.set(key);
    this.persist();
    return item;
  }

  /** The only removal path besides mode-driven eviction inside `open()`. */
  close(type: ContextItemType, id: string): void {
    const key = keyOf(type, id);
    if (!this._items().has(key)) return;

    this._items.update((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });
    if (this._currentId() === key) {
      this._currentId.set(null);
    }
    this.persist();
  }

  setCurrent(type: ContextItemType, id: string): void {
    const key = keyOf(type, id);
    if (this._items().has(key)) {
      this._currentId.set(key);
      this.persist();
    }
  }

  markDirty(type: ContextItemType, id: string, dirty = true): void {
    const key = keyOf(type, id);
    const existing = this._items().get(key);
    if (!existing || existing.dirty === dirty) return;

    this._items.update((current) => {
      const next = new Map(current);
      next.set(key, { ...existing, dirty });
      return next;
    });
    this.persist();
  }

  /**
   * Full, explicit reset. Deliberately not called from anywhere in this
   * service or wired to any component lifecycle — only an explicit, whole-
   * session action (e.g. logout) should ever call this.
   */
  clear(): void {
    this._items.set(new Map());
    this._currentId.set(null);
    clearStorage();
  }

  /**
   * Lets the screen currently editing an item supply how to save it, so the
   * context bar's "unsaved changes" close flow can trigger a real save
   * without knowing anything about that screen. Returns an unregister
   * function the screen must call from its own `destroyRef.onDestroy()`.
   */
  registerSaveHandler(type: ContextItemType, id: string, handler: () => Observable<boolean>): () => void {
    const key = keyOf(type, id);
    this.saveHandlers.set(key, handler);
    return () => {
      if (this.saveHandlers.get(key) === handler) {
        this.saveHandlers.delete(key);
      }
    };
  }

  /** Resolves `false` if nothing is registered for this item (e.g. its screen isn't mounted). */
  requestSave(type: ContextItemType, id: string): Observable<boolean> {
    const handler = this.saveHandlers.get(keyOf(type, id));
    return handler ? handler() : of(false);
  }

  // ---- Persistence -------------------------------------------------------

  private restoreFromStorage(): void {
    const persisted = readStorage();
    if (!persisted) return;
    this.applyState(persisted.items, persisted.currentId);
  }

  private applyState(items: readonly ContextItem[], currentId: string | null): void {
    const map = new Map(items.map((item) => [keyOf(item.type, item.id), item] as const));
    this._items.set(map);
    this._currentId.set(currentId !== null && map.has(currentId) ? currentId : null);
  }

  private persist(): void {
    const state: PersistedState = {
      version: 1,
      items: this.items(),
      currentId: this._currentId(),
    };
    writeStorage(state);
    this.channel?.postMessage(state);
  }

  // ---- Rehydration / backend validation -----------------------------------

  /** Re-validates every persisted item against the backend; drops anything
   *  gone, inaccessible, or never actually saved (a draft id can't survive a
   *  reload meaningfully — its form state is already lost). */
  private async rehydrate(): Promise<void> {
    const candidates = this.items();
    if (candidates.length === 0) return;

    const checks = await Promise.all(
      candidates.map(async (item) => ({ item, ok: await this.stillExists(item) })),
    );
    const survivors = checks.filter((check) => check.ok).map((check) => check.item);
    if (survivors.length === checks.length) return;

    const survivorKeys = new Set(survivors.map((item) => keyOf(item.type, item.id)));
    this._items.update((current) => {
      const next = new Map<string, ContextItem>();
      for (const [key, value] of current) {
        if (survivorKeys.has(key)) next.set(key, value);
      }
      return next;
    });
    const currentId = this._currentId();
    if (currentId !== null && !survivorKeys.has(currentId)) {
      this._currentId.set(null);
    }
    this.persist();
  }

  private stillExists(item: ContextItem): Promise<boolean> {
    const entityId = Number(item.id);
    if (!Number.isInteger(entityId) || entityId <= 0) {
      return Promise.resolve(false);
    }

    const lookup$: Observable<unknown> =
      item.type === 'order' ? this.ordersApi.getById(entityId) : this.shipmentsApi.getById(entityId);

    return firstValueFrom(
      lookup$.pipe(
        map(() => true),
        catchError(() => of(false)),
      ),
    );
  }
}
