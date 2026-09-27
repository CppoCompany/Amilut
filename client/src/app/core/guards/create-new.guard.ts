import { inject } from '@angular/core';

import type { ContextItemType } from '../../features/workspace/active-context.model';
import { ActiveContextService } from '../../features/workspace/active-context.service';
import { ContextDialogService } from '../../features/workspace/context-dialog.service';
import { resolvePendingUnsavedChanges } from './resolve-unsaved-changes';

/**
 * Functional guard for the "Create New Order/File" sidebar entries
 * (`ws-order` / `ws-shipment`), invoked from `NavigationService.trySelectChild`
 * — see `itemOpenGuard`'s doc comment for why this isn't a real route guard.
 *
 * No active item of `type` -> opens `draft` and allows.
 * An active item exists -> `ConfirmCreateNewDialog`:
 *   - "Continue with existing" -> focuses it, blocks the create action.
 *   - "Create new" -> resolves unsaved changes on the existing item first,
 *     then opens `draft` (single-per-type mode evicts the old one inside
 *     `ActiveContextService.open()` itself — nothing extra to do here for
 *     either mode).
 *   - "Cancel" -> blocks, nothing changes.
 */
export function createNewGuard(
  type: ContextItemType,
  draft: { id: string; label: string },
): Promise<boolean> {
  const activeContext = inject(ActiveContextService);
  const dialogs = inject(ContextDialogService);

  const existing = activeContext.byType(type)()[0] ?? null;
  if (!existing) {
    activeContext.open({ type, id: draft.id, label: draft.label });
    return Promise.resolve(true);
  }

  return dialogs.confirmCreateNew(type, existing).then(async (choice) => {
    if (choice === 'cancel') return false;
    if (choice === 'continueExisting') {
      activeContext.setCurrent(existing.type, existing.id);
      return false;
    }

    const allowed = await resolvePendingUnsavedChanges(existing, activeContext, dialogs);
    if (!allowed) return false;
    activeContext.open({ type, id: draft.id, label: draft.label });
    return true;
  });
}
