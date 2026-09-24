import { inject } from '@angular/core';

import { ActiveContextService } from '../../features/workspace/active-context.service';
import { ContextDialogService } from '../../features/workspace/context-dialog.service';
import { resolvePendingUnsavedChanges } from './resolve-unsaved-changes';

/**
 * Functional guard for leaving the currently-active screen for an unrelated
 * sidebar page (i.e. not a "create new"/"open existing" action, which have
 * their own more specific guards above). Invoked from
 * `NavigationService.trySelectChild` for every page other than `order`/
 * `shipment`. Reads `ActiveContextService.current()`'s `dirty` flag — set via
 * `markDirty()` by whichever screen owns that item.
 */
export function canDeactivateCurrentItemGuard(): Promise<boolean> {
  const activeContext = inject(ActiveContextService);
  const dialogs = inject(ContextDialogService);

  const current = activeContext.current();
  if (!current) return Promise.resolve(true);
  return resolvePendingUnsavedChanges(current, activeContext, dialogs);
}
