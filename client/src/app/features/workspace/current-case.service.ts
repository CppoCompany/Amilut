import { Injectable, signal } from '@angular/core';

/**
 * The case ("מספר תיק" = `mbl` id) the per-case workspace screens work on —
 * the filing screen files paperwork under it and the classification screen
 * reads its extracted supplier-invoice line items. Chosen with the
 * {@link CasePicker} at the top of those screens and shared between them, so
 * a case picked on one is still selected on the other. `null` until the user
 * picks one.
 */
@Injectable({ providedIn: 'root' })
export class CurrentCaseService {
  readonly caseId = signal<number | null>(null);
}
