import { inject } from '@angular/core';

import type { OpenContextItemInput } from '../../features/workspace/active-context.model';
import { ActiveContextService } from '../../features/workspace/active-context.service';
import { ContextDialogService } from '../../features/workspace/context-dialog.service';
import { resolvePendingUnsavedChanges } from './resolve-unsaved-changes';

/**
 * Functional guard (Angular `CanActivateFn`-shaped, `inject()`-based) for
 * opening an existing Order/File. This app has no per-item routes to attach
 * a real `canActivate` to (see the architecture doc — the bar must stay
 * independent of routing), so this is invoked directly by the two entry
 * points that open an existing item: `MyOrdersScreen.onEditOrder` and
 * `MyFilesScreen.onEditCase`, wrapped in `runInInjectionContext`.
 *
 * Registers `request` and makes it current. If a *different* item of the
 * same type is already open and dirty (the one `single-per-type` mode would
 * otherwise silently evict), resolves the unsaved-changes flow first.
 */
export function itemOpenGuard(request: OpenContextItemInput): Promise<boolean> {
  const activeContext = inject(ActiveContextService);
  const dialogs = inject(ContextDialogService);

  const conflicting = activeContext.byType(request.type)().find((item) => item.id !== request.id);
  if (!conflicting) {
    activeContext.open(request);
    return Promise.resolve(true);
  }

  return resolvePendingUnsavedChanges(conflicting, activeContext, dialogs).then((allowed) => {
    if (allowed) activeContext.open(request);
    return allowed;
  });
}
