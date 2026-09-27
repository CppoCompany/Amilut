import { firstValueFrom } from 'rxjs';

import type { ContextItem } from '../../features/workspace/active-context.model';
import type { ActiveContextService } from '../../features/workspace/active-context.service';
import type { ContextDialogService } from '../../features/workspace/context-dialog.service';

/**
 * Shared Save/Discard/Cancel resolution for one dirty item, used by all three
 * guards below. Resolves `true` once it's safe for the caller to proceed
 * (item was clean to begin with, was discarded, or saved successfully);
 * `false` if the caller must not proceed (cancelled, or the save failed).
 * Never touches `ActiveContextService`'s items map itself — each guard
 * decides what "proceeding" means (open/evict/navigate-away).
 */
export async function resolvePendingUnsavedChanges(
  item: ContextItem,
  activeContext: ActiveContextService,
  dialogs: ContextDialogService,
): Promise<boolean> {
  if (!item.dirty) return true;

  const choice = await dialogs.confirmUnsavedChanges(item);
  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;
  return firstValueFrom(activeContext.requestSave(item.type, item.id));
}
