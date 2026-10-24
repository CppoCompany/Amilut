import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';

import { FilingContextService } from '../../filing-context.service';
import { FilingRecords } from '../../filing-records/filing-records';
import { ImportFilesPanel } from '../../import-files-panel/import-files-panel';
import { NavigationService } from '../../navigation.service';

/**
 * "תיוק ניירת יבוא" — import paperwork filing view: upload on the right, the
 * Orders / CCFs tables and the selected record's documents on the left.
 */
@Component({
  selector: 'app-filing-screen',
  imports: [FilingRecords, ImportFilesPanel],
  templateUrl: './filing.html',
  styleUrl: './filing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilingScreen {
  private readonly nav = inject(NavigationService);
  private readonly filingContext = inject(FilingContextService);

  protected readonly context = this.filingContext.context;

  constructor() {
    // The Order/CCF screens' "תיוק ניירת יבוא" link and "ייבוא מסמכים" in
    // "ההזמנות שלי" navigate to `/workspace/filing?orderId=N`/`?ccfId=N`,
    // which NavigationService.applyUrl turns into `openFilingContext` before
    // this screen shows. Consume it once as soon as it appears and preselect
    // it — its tab opens and its row is highlighted. An effect rather than a one-shot
    // constructor read, same reasoning as the order screen's `editOrderId`:
    // Back/Forward can land on a filing URL while this instance is already
    // mounted.
    effect(() => {
      const incoming = this.nav.openFilingContext();
      if (incoming === null) return;
      untracked(() => {
        this.nav.openFilingContext.set(null);
        this.filingContext.context.set(incoming);
      });
    });
  }
}
