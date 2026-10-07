import { Injectable, signal } from '@angular/core';

import { CURRENT_CASE_NUMBER } from './current-case';

/**
 * The import case ("מספר תיק" = `order_account` id) the filing and
 * classification screens currently work on. Starts at the shared placeholder
 * (`CURRENT_CASE_NUMBER`) and is re-pointed when a row of "הסיווגים שלי" is
 * opened, so the classification screen loads that case's invoice lines.
 */
@Injectable({ providedIn: 'root' })
export class CurrentCaseService {
  readonly caseId = signal<number>(CURRENT_CASE_NUMBER);
}
