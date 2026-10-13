import { Injectable, signal } from '@angular/core';
import type { FilingContext } from '../../api/filing-context.model';

/**
 * The Order or CCF currently picked for the Filing/Classification screens —
 * shared state so switching the pick on one screen is reflected on the
 * other, exactly like the (now-retired) `CurrentCaseService` did for MBL
 * cases. `null` until the user picks one or arrives via a nav hand-off.
 */
@Injectable({ providedIn: 'root' })
export class FilingContextService {
  readonly context = signal<FilingContext | null>(null);
}
